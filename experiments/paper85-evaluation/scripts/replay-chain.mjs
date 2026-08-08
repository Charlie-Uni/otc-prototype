import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, '..', '..', '..');
const requireFromApi = createRequire(resolve(REPO_ROOT, 'apps/api/package.json'));
const {
  createPublicClient,
  createWalletClient,
  decodeEventLog,
  http,
  keccak256,
  stringToHex,
  toHex,
} = requireFromApi('viem');
const { mnemonicToAccount } = requireFromApi('viem/accounts');

const MNEMONIC = 'test test test test test test test test test test test junk';
const GENESIS_TIMESTAMP = 1_710_000_000;
const CHAIN_ID = 31_337;
const ZERO_ROLE = `0x${'0'.repeat(64)}`;
const FUND_ID = keccak256(stringToHex('OTC_FUND_REPLAY_V1'));
const PAYLOAD_INITIAL = keccak256(stringToHex('REPLAY_INITIAL_NAV'));
const PAYLOAD_FORMULA = keccak256(stringToHex('REPLAY_FORMULA_NAV'));
const DELAY_REASON = keccak256(stringToHex('REPLAY_SETTLEMENT_DELAY'));
const ALICE_VC_HASH = keccak256(stringToHex('REPLAY_ALICE_ELIGIBILITY'));
const BOB_VC_HASH = keccak256(stringToHex('REPLAY_BOB_ELIGIBILITY'));
const ROLE_NAMES = {
  PAUSER_ROLE: keccak256(stringToHex('PAUSER_ROLE')),
  SUBSCRIPTION_ROLE: keccak256(stringToHex('SUBSCRIPTION_ROLE')),
  REDEMPTION_ROLE: keccak256(stringToHex('REDEMPTION_ROLE')),
  MANAGER_ROLE: keccak256(stringToHex('MANAGER_ROLE')),
};

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function normalizeAddress(value) {
  return value.toLowerCase();
}

function jsonValue(value) {
  if (typeof value === 'bigint') return value.toString();
  if (Array.isArray(value)) return value.map(jsonValue);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, jsonValue(item)]));
  }
  return value;
}

function roleKey(contractName, role, account) {
  return `${contractName}:${role.toLowerCase()}:${normalizeAddress(account)}`;
}

async function artifact(name) {
  const value = JSON.parse(await readFile(resolve(REPO_ROOT, `contracts/out/${name}.sol/${name}.json`)));
  invariant(/^0x[0-9a-f]+$/i.test(value.bytecode.object), `${name}: missing deployment bytecode`);
  return { abi: value.abi, bytecode: value.bytecode.object };
}

async function waitForAnvil(client, child, stderr) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`anvil exited before readiness: ${stderr()}`);
    try {
      if (await client.getChainId() === CHAIN_ID) return;
    } catch {
      // The socket is not ready yet.
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 25));
  }
  throw new Error(`anvil did not become ready: ${stderr()}`);
}

async function stopAnvil(child) {
  if (child.exitCode !== null) return;
  child.kill('SIGTERM');
  await Promise.race([
    new Promise((resolveExit) => child.once('exit', resolveExit)),
    new Promise((resolveDelay) => setTimeout(resolveDelay, 2_000)),
  ]);
  if (child.exitCode === null) child.kill('SIGKILL');
}

async function setNextTimestamp(client, atSec) {
  await client.request({
    method: 'evm_setNextBlockTimestamp',
    params: [toHex(GENESIS_TIMESTAMP + atSec)],
  });
}

async function waitReceipt(client, hash, label) {
  const receipt = await client.waitForTransactionReceipt({ hash });
  invariant(receipt.status === 'success', `${label}: transaction reverted`);
  return receipt;
}

async function deployAt({ client, wallet, artifactValue, args, atSec, label }) {
  await setNextTimestamp(client, atSec);
  const hash = await wallet.deployContract({
    abi: artifactValue.abi,
    bytecode: artifactValue.bytecode,
    args,
  });
  const receipt = await waitReceipt(client, hash, label);
  invariant(receipt.contractAddress, `${label}: deployment address missing`);
  return { address: receipt.contractAddress, receipt };
}

async function writeAt({ client, wallet, contract, functionName, args = [], atSec, label }) {
  await setNextTimestamp(client, atSec);
  const hash = await wallet.writeContract({
    address: contract.address,
    abi: contract.abi,
    functionName,
    args,
  });
  const receipt = await waitReceipt(client, hash, label);
  return receipt;
}

function navRecord(value) {
  const field = (name, index) => value[name] ?? value[index];
  return {
    nav: String(field('nav', 0)),
    netAssetValue: String(field('netAssetValue', 1)),
    totalSharesSnapshot: String(field('totalSharesSnapshot', 2)),
    asOf: String(field('asOf', 3)),
    storedAt: String(field('storedAt', 4)),
    navAdjustmentBps: String(field('navAdjustmentBps', 5)),
    payloadHash: String(field('payloadHash', 6)).toLowerCase(),
    isInitial: Boolean(field('isInitial', 7)),
  };
}

function subscriptionRecord(value) {
  const field = (name, index) => value[name] ?? value[index];
  return {
    investor: normalizeAddress(field('investor', 0)),
    subscriptionAmount: String(field('subscriptionAmount', 1)),
    mintedShares: String(field('mintedShares', 2)),
    navUsed: String(field('navUsed', 3)),
    navAsOf: String(field('navAsOf', 4)),
    requestedAt: String(field('requestedAt', 5)),
    acceptedAt: String(field('acceptedAt', 6)),
    requestHash: String(field('requestHash', 7)).toLowerCase(),
    accepted: Boolean(field('accepted', 8)),
  };
}

function redemptionRecord(value) {
  const field = (name, index) => value[name] ?? value[index];
  return {
    investor: normalizeAddress(field('investor', 0)),
    redeemedShares: String(field('redeemedShares', 1)),
    redemptionAmount: String(field('redemptionAmount', 2)),
    settlementNav: String(field('settlementNav', 3)),
    settlementNavAsOf: String(field('settlementNavAsOf', 4)),
    requestedAt: String(field('requestedAt', 5)),
    settledAt: String(field('settledAt', 6)),
    delayedAt: String(field('delayedAt', 7)),
    delayReasonHash: String(field('delayReasonHash', 8)).toLowerCase(),
    settled: Boolean(field('settled', 9)),
    delayed: Boolean(field('delayed', 10)),
  };
}

async function readProjection({ client, contracts, actors, roleChecks, blockNumber }) {
  const read = (contract, functionName, args = []) => client.readContract({
    address: contract.address,
    abi: contract.abi,
    functionName,
    args,
    blockNumber,
  });

  const [
    totalSupply,
    subscriptionRequestCount,
    redemptionRequestCount,
    totalQueuedRedemption,
    paused,
  ] = await Promise.all([
    read(contracts.fundToken, 'totalSupply'),
    read(contracts.fundToken, 'subscriptionRequestCount'),
    read(contracts.fundToken, 'redemptionRequestCount'),
    read(contracts.fundToken, 'totalQueuedRedemption'),
    read(contracts.fundToken, 'paused'),
  ]);

  const balances = {};
  const whitelist = {};
  const queuedRedemption = {};
  for (const actor of actors.map(normalizeAddress).sort()) {
    const [balance, eligible, queued] = await Promise.all([
      read(contracts.fundToken, 'balanceOf', [actor]),
      read(contracts.fundToken, 'whitelist', [actor]),
      read(contracts.fundToken, 'queuedRedemptionOf', [actor]),
    ]);
    balances[actor] = balance.toString();
    whitelist[actor] = eligible;
    queuedRedemption[actor] = queued.toString();
  }

  const roles = {};
  for (const check of roleChecks) {
    const contract = contracts[check.contractKey];
    roles[roleKey(check.contractName, check.role, check.account)] = await read(
      contract,
      'hasRole',
      [check.role, check.account],
    );
  }

  const navHistory = [];
  const navLength = await read(contracts.navRegistry, 'historyLength', [FUND_ID]);
  for (let index = 0n; index < navLength; index += 1n) {
    navHistory.push(navRecord(await read(contracts.navRegistry, 'navAt', [FUND_ID, index])));
  }

  const subscriptions = [];
  for (let index = 0n; index < subscriptionRequestCount; index += 1n) {
    subscriptions.push(subscriptionRecord(await read(contracts.fundToken, 'subscriptionRequestAt', [index])));
  }

  const redemptions = [];
  for (let index = 0n; index < redemptionRequestCount; index += 1n) {
    redemptions.push(redemptionRecord(await read(contracts.fundToken, 'redemptionRequestAt', [index])));
  }

  return {
    totalSupply: totalSupply.toString(),
    subscriptionRequestCount: subscriptionRequestCount.toString(),
    redemptionRequestCount: redemptionRequestCount.toString(),
    totalQueuedRedemption: totalQueuedRedemption.toString(),
    balances,
    whitelist,
    queuedRedemption,
    paused,
    roles: Object.fromEntries(Object.entries(roles).sort()),
    navHistory,
    subscriptions,
    redemptions,
  };
}

function decodeLogs(rawLogs, contracts) {
  const contractByAddress = new Map([
    [normalizeAddress(contracts.fundToken.address), { ...contracts.fundToken, name: 'FundToken' }],
    [normalizeAddress(contracts.navRegistry.address), { ...contracts.navRegistry, name: 'NAVRegistry' }],
    [normalizeAddress(contracts.riskRegistry.address), { ...contracts.riskRegistry, name: 'RiskRegistry' }],
  ]);
  return rawLogs.map((log) => {
    const contract = contractByAddress.get(normalizeAddress(log.address));
    invariant(contract, `log from unregistered contract ${log.address}`);
    const decoded = decodeEventLog({ abi: contract.abi, data: log.data, topics: log.topics, strict: true });
    return {
      contractName: contract.name,
      contractAddress: normalizeAddress(log.address),
      eventName: decoded.eventName,
      args: jsonValue(decoded.args),
      blockNumber: BigInt(log.blockNumber),
      transactionHash: log.transactionHash.toLowerCase(),
      logIndex: Number(BigInt(log.logIndex)),
      topics: log.topics.map((topic) => topic.toLowerCase()),
      data: log.data.toLowerCase(),
    };
  }).sort((left, right) => (
    Number(left.blockNumber - right.blockNumber) || left.logIndex - right.logIndex
  ));
}

export async function startReplayScenario(port) {
  const rpcUrl = `http://127.0.0.1:${port}`;
  let stderr = '';
  const child = spawn('anvil', [
    '--port', String(port),
    '--chain-id', String(CHAIN_ID),
    '--timestamp', String(GENESIS_TIMESTAMP),
    '--hardfork', 'osaka',
    '--mnemonic', MNEMONIC,
    '--quiet',
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });

  const client = createPublicClient({ transport: http(rpcUrl) });
  try {
    await waitForAnvil(client, child, () => stderr);
    const accounts = {
      admin: mnemonicToAccount(MNEMONIC, { addressIndex: 0 }),
      manager: mnemonicToAccount(MNEMONIC, { addressIndex: 1 }),
      alice: mnemonicToAccount(MNEMONIC, { addressIndex: 2 }),
      bob: mnemonicToAccount(MNEMONIC, { addressIndex: 3 }),
      operator2: mnemonicToAccount(MNEMONIC, { addressIndex: 4 }),
    };
    const wallets = Object.fromEntries(Object.entries(accounts).map(([name, account]) => [
      name,
      createWalletClient({ account, transport: http(rpcUrl) }),
    ]));

    const [navArtifact, fundArtifact, riskArtifact] = await Promise.all([
      artifact('NAVRegistry'),
      artifact('FundToken'),
      artifact('RiskRegistry'),
    ]);
    const navDeployment = await deployAt({
      client,
      wallet: wallets.admin,
      artifactValue: navArtifact,
      args: [accounts.admin.address],
      atSec: 10,
      label: 'deploy NAVRegistry',
    });
    const fundDeployment = await deployAt({
      client,
      wallet: wallets.admin,
      artifactValue: fundArtifact,
      args: [accounts.admin.address, 'OTC Fund Replay', 'OTCR', FUND_ID, navDeployment.address],
      atSec: 20,
      label: 'deploy FundToken',
    });
    const riskDeployment = await deployAt({
      client,
      wallet: wallets.admin,
      artifactValue: riskArtifact,
      args: [accounts.admin.address, [1667, 1667, 1667, 1667, 1666, 1666], 30 * 24 * 60 * 60, 7000],
      atSec: 30,
      label: 'deploy RiskRegistry',
    });
    const contracts = {
      fundToken: { address: fundDeployment.address, abi: fundArtifact.abi },
      navRegistry: { address: navDeployment.address, abi: navArtifact.abi },
      riskRegistry: { address: riskDeployment.address, abi: riskArtifact.abi },
    };

    const bootstrapReceipts = [navDeployment.receipt, fundDeployment.receipt, riskDeployment.receipt];
    bootstrapReceipts.push(await writeAt({ client, wallet: wallets.admin, contract: contracts.fundToken, functionName: 'setRiskGate', args: [contracts.riskRegistry.address], atSec: 40, label: 'configure risk gate' }));
    bootstrapReceipts.push(await writeAt({ client, wallet: wallets.admin, contract: contracts.fundToken, functionName: 'grantRole', args: [ROLE_NAMES.SUBSCRIPTION_ROLE, accounts.admin.address], atSec: 50, label: 'bootstrap subscription role' }));
    bootstrapReceipts.push(await writeAt({ client, wallet: wallets.admin, contract: contracts.fundToken, functionName: 'grantRole', args: [ROLE_NAMES.REDEMPTION_ROLE, accounts.admin.address], atSec: 60, label: 'bootstrap redemption role' }));
    bootstrapReceipts.push(await writeAt({ client, wallet: wallets.admin, contract: contracts.navRegistry, functionName: 'grantRole', args: [ROLE_NAMES.MANAGER_ROLE, accounts.manager.address], atSec: 70, label: 'bootstrap NAV manager role' }));

    const actors = Object.values(accounts).map((account) => normalizeAddress(account.address));
    const roleChecks = [
      { contractKey: 'fundToken', contractName: 'FundToken', role: ZERO_ROLE, account: accounts.admin.address },
      { contractKey: 'fundToken', contractName: 'FundToken', role: ROLE_NAMES.PAUSER_ROLE, account: accounts.admin.address },
      { contractKey: 'fundToken', contractName: 'FundToken', role: ROLE_NAMES.SUBSCRIPTION_ROLE, account: accounts.admin.address },
      { contractKey: 'fundToken', contractName: 'FundToken', role: ROLE_NAMES.REDEMPTION_ROLE, account: accounts.admin.address },
      { contractKey: 'fundToken', contractName: 'FundToken', role: ROLE_NAMES.SUBSCRIPTION_ROLE, account: accounts.operator2.address },
      { contractKey: 'navRegistry', contractName: 'NAVRegistry', role: ZERO_ROLE, account: accounts.admin.address },
      { contractKey: 'navRegistry', contractName: 'NAVRegistry', role: ROLE_NAMES.MANAGER_ROLE, account: accounts.manager.address },
    ];
    const genesis = {
      chainId: CHAIN_ID,
      genesisTimestamp: GENESIS_TIMESTAMP,
      fundId: FUND_ID,
      actors,
      roles: roleChecks.map((check) => ({
        contractName: check.contractName,
        role: check.role,
        account: normalizeAddress(check.account),
        enabled: normalizeAddress(check.account) !== normalizeAddress(accounts.operator2.address),
      })),
      contracts: Object.fromEntries(Object.entries(contracts).map(([key, contract]) => [key, normalizeAddress(contract.address)])),
    };

    const checkpoints = [];
    async function operation(id, label, wallet, contract, functionName, args, atSec) {
      const receipt = await writeAt({ client, wallet, contract, functionName, args, atSec, label });
      if (checkpoints.length > 0) {
        invariant(receipt.blockNumber > checkpoints.at(-1).blockNumber, `${id}: operation did not receive a distinct block`);
      }
      checkpoints.push({
        index: checkpoints.length,
        operationId: id,
        label,
        blockNumber: receipt.blockNumber,
        transactionHash: receipt.transactionHash.toLowerCase(),
        gasUsed: receipt.gasUsed.toString(),
      });
    }

    await operation('O01', 'whitelist Alice', wallets.admin, contracts.fundToken, 'setWhitelisted', [accounts.alice.address, true, ALICE_VC_HASH], 100);
    await operation('O02', 'whitelist Bob', wallets.admin, contracts.fundToken, 'setWhitelisted', [accounts.bob.address, true, BOB_VC_HASH], 110);
    await operation('O03', 'post initial NAV', wallets.manager, contracts.navRegistry, 'postInitialNAV', [FUND_ID, 10n ** 18n, BigInt(GENESIS_TIMESTAMP + 120), PAYLOAD_INITIAL], 120);
    await operation('O04', 'request subscription', wallets.alice, contracts.fundToken, 'requestSubscription', [100n * 10n ** 18n], 130);
    await operation('O05', 'accept subscription', wallets.admin, contracts.fundToken, 'acceptSubscription', [0n], 140);
    await operation('O06', 'restricted transfer', wallets.alice, contracts.fundToken, 'transfer', [accounts.bob.address, 20n * 10n ** 18n], 150);
    await operation('O07', 'post formula NAV', wallets.manager, contracts.navRegistry, 'postNAV', [FUND_ID, 120n * 10n ** 18n, 100n * 10n ** 18n, BigInt(GENESIS_TIMESTAMP + 160), PAYLOAD_FORMULA], 160);
    await operation('O08', 'request redemption', wallets.bob, contracts.fundToken, 'requestRedemption', [10n * 10n ** 18n], 170);
    await operation('O09', 'flag settlement delayed', wallets.admin, contracts.fundToken, 'flagSettlementDelayed', [0n, DELAY_REASON], 180);
    await operation('O10', 'settle redemption', wallets.admin, contracts.fundToken, 'settleRedemption', [0n], 190);
    await operation('O11', 'pause lifecycle', wallets.admin, contracts.fundToken, 'pause', [], 200);
    await operation('O12', 'resume lifecycle', wallets.admin, contracts.fundToken, 'unpause', [], 210);
    await operation('O13', 'grant subscription role', wallets.admin, contracts.fundToken, 'grantRole', [ROLE_NAMES.SUBSCRIPTION_ROLE, accounts.operator2.address], 220);
    await operation('O14', 'revoke subscription role', wallets.admin, contracts.fundToken, 'revokeRole', [ROLE_NAMES.SUBSCRIPTION_ROLE, accounts.operator2.address], 230);

    const fromBlock = checkpoints[0].blockNumber;
    const toBlock = checkpoints.at(-1).blockNumber;
    const contractAddresses = Object.values(contracts).map((contract) => contract.address);
    const bootstrapRawLogs = await client.request({
      method: 'eth_getLogs',
      params: [{
        address: contractAddresses,
        fromBlock: toHex(bootstrapReceipts[0].blockNumber),
        toBlock: toHex(fromBlock - 1n),
      }],
    });
    const rawLogs = await client.request({
      method: 'eth_getLogs',
      params: [{
        address: contractAddresses,
        fromBlock: toHex(fromBlock),
        toBlock: toHex(toBlock),
      }],
    });
    const decodedLogs = decodeLogs(rawLogs, contracts);

    let replayComplete = false;
    return {
      genesis,
      contracts,
      actors,
      roleChecks,
      checkpoints,
      bootstrapLogs: decodeLogs(bootstrapRawLogs, contracts),
      rawLogs: decodedLogs,
      markReplayComplete() {
        replayComplete = true;
      },
      readProjection(blockNumber) {
        invariant(replayComplete, 'VIEW_READ_BEFORE_REPLAY_COMPLETE');
        return readProjection({ client, contracts, actors, roleChecks, blockNumber });
      },
      close: () => stopAnvil(child),
    };
  } catch (error) {
    await stopAnvil(child);
    throw new Error(`${error instanceof Error ? error.message : String(error)}${stderr ? `\nanvil: ${stderr}` : ''}`);
  }
}
