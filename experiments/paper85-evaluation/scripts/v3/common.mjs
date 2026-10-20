// Shared harness for the Paper 8.5 v3 evaluation (comparators, scale, case).
// Production behaviour always comes from contracts/out (chapter3-artifact-v1.4.0
// sources); comparators come from experiments/paper85-evaluation/baselines/out.
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RUN_DIR, assertRuntime, record, recordReceipt } from './evidence.mjs';

export const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
export const EVAL_DIR = resolve(SCRIPT_DIR, '..', '..');
export const REPO_ROOT = resolve(EVAL_DIR, '..', '..');
// Runners are launched by run-revision.mjs into a fresh, unsealed directory.
export const RESULTS_DIR = RUN_DIR;

const requireFromApi = createRequire(resolve(REPO_ROOT, 'apps/api/package.json'));
export const viem = requireFromApi('viem');
const { mnemonicToAccount } = requireFromApi('viem/accounts');
const { createPublicClient, createWalletClient, http, toHex, decodeEventLog, BaseError, ContractFunctionRevertedError } = viem;

export const MNEMONIC = 'test test test test test test test test test test test junk';
export const GENESIS_TIMESTAMP = 1_710_000_000;
export const CHAIN_ID = 31_337;
export const ZERO_ROLE = `0x${'0'.repeat(64)}`;
export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
export const E18 = 10n ** 18n;

export function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

export const lower = (value) => String(value).toLowerCase();

export function jsonValue(value) {
  if (typeof value === 'bigint') return value.toString();
  if (Array.isArray(value)) return value.map(jsonValue);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, jsonValue(item)]));
  }
  return value;
}

export function sha256(text) {
  return createHash('sha256').update(text).digest('hex');
}

export async function sha256File(path) {
  return sha256(await readFile(path));
}

export function stableStringify(value) {
  return JSON.stringify(jsonValue(value), null, 2);
}

export async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const text = `${stableStringify(value)}\n`;
  await writeFile(path, text, { flag: 'wx' });
  return sha256(text);
}

export function gitHead() {
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: REPO_ROOT }).toString().trim();
  const dirty = execFileSync('git', ['status', '--porcelain', '--', 'experiments/paper85-evaluation/scripts', 'experiments/paper85-evaluation/spec-v3', 'experiments/paper85-evaluation/spec', 'experiments/paper85-evaluation/baselines', 'contracts/src', 'contracts/foundry.toml', 'apps/api/package.json', 'pnpm-lock.yaml'], { cwd: REPO_ROOT }).toString().trim() !== '';
  invariant(!dirty, 'Uncommitted governed execution inputs; commit before running');
  return { commit, governedInputsDirty: dirty };
}

export function toolVersions() {
  const run = (cmd, args) => execFileSync(cmd, args).toString().split('\n')[0].trim();
  return {
    node: process.version,
    forge: run('forge', ['--version']),
    anvil: run('anvil', ['--version']),
    viem: requireFromApi('viem/package.json').version,
  };
}

export async function artifact(name, { baseline = false } = {}) {
  const root = baseline ? resolve(EVAL_DIR, 'baselines/out') : resolve(REPO_ROOT, 'contracts/out');
  const value = JSON.parse(await readFile(resolve(root, `${name}.sol/${name}.json`)));
  invariant(RESULTS_DIR, 'Use run-revision.mjs to create an isolated evidence run');
  const verified = JSON.parse(await readFile(resolve(RESULTS_DIR, 'build', `${name}.artifact.json`)));
  invariant(sha256(JSON.stringify(value)) === sha256(JSON.stringify(verified)), `${name}: artifact changed after verified build`);
  invariant(/^0x[0-9a-f]+$/i.test(value.bytecode.object), `${name}: missing bytecode`);
  return {
    name,
    abi: value.abi,
    bytecode: value.bytecode.object,
    runtime: value.deployedBytecode.object,
    immutableReferences: value.deployedBytecode.immutableReferences,
    deployedSize: (value.deployedBytecode.object.length - 2) / 2,
    initcodeSize: (value.bytecode.object.length - 2) / 2,
  };
}

export function account(index) {
  return mnemonicToAccount(MNEMONIC, { addressIndex: index });
}

export async function startAnvil(port, { accounts = 10, extraArgs = [] } = {}) {
  invariant(RESULTS_DIR, 'Use run-revision.mjs');
  let stderr = '';
  const child = spawn('anvil', [
    '--port', String(port),
    '--chain-id', String(CHAIN_ID),
    '--timestamp', String(GENESIS_TIMESTAMP),
    '--hardfork', 'osaka',
    '--mnemonic', MNEMONIC,
    '--accounts', String(accounts),
    '--quiet',
    ...extraArgs,
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
  const rpcUrl = `http://127.0.0.1:${port}`;
  const client = createPublicClient({ transport: http(rpcUrl, { batch: false }), pollingInterval: 5 });
  const tapeDir = resolve(RESULTS_DIR, 'chains');
  await mkdir(tapeDir, { recursive: true });
  client.evidencePath = resolve(tapeDir, `${port}-${Date.now()}.jsonl`);
  await record(client, { kind: 'chain', port, accounts, chainId: CHAIN_ID, genesisTimestamp: GENESIS_TIMESTAMP,
    hardfork: 'osaka', automine: true, mnemonic: MNEMONIC, extraArgs });
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`anvil exited: ${stderr}`);
    try {
      if (await client.getChainId() === CHAIN_ID) break;
    } catch { /* not ready */ }
    await new Promise((r) => setTimeout(r, 25));
    invariant(attempt < 199, `anvil not ready: ${stderr}`);
  }
  const walletFor = (acct) => createWalletClient({ account: acct, transport: http(rpcUrl) });
  async function stop() {
    if (child.exitCode !== null) return;
    child.kill('SIGTERM');
    await Promise.race([
      new Promise((r) => child.once('exit', r)),
      new Promise((r) => setTimeout(r, 2000)),
    ]);
    if (child.exitCode === null) child.kill('SIGKILL');
  }
  return { client, rpcUrl, walletFor, stop };
}

// Direct receipt polling. Anvil automines each transaction; viem's
// block-watching waitForTransactionReceipt occasionally missed already-mined
// receipts under 5 ms polling, so the receipt is fetched directly instead.
export async function receiptOf(client, hash, label) {
  for (let attempt = 0; attempt < 5000; attempt += 1) {
    const receipt = await client.request({ method: 'eth_getTransactionReceipt', params: [hash] });
    if (receipt) return client.getTransactionReceipt({ hash });
    await new Promise((r) => setTimeout(r, 2));
  }
  throw new Error(`${label}: no receipt for ${hash}`);
}

export async function setNextTimestamp(client, absoluteSec) {
  await client.request({ method: 'evm_setNextBlockTimestamp', params: [toHex(absoluteSec)] });
}

export async function deploy({ client, wallet, art, args, at }) {
  if (at !== undefined) await setNextTimestamp(client, at);
  const hash = await wallet.deployContract({ abi: art.abi, bytecode: art.bytecode, args });
  const receipt = await receiptOf(client, hash, `deploy ${art.name}`);
  invariant(receipt.status === 'success' && receipt.contractAddress, `deploy ${art.name} failed`);
  const runtime = await client.getCode({ address: receipt.contractAddress });
  assertRuntime(runtime, art);
  await recordReceipt(client, receipt, { deployment: art.name, args, at, runtime,
    verifiedArtifact: `build/${art.name}.artifact.json` });
  return { address: receipt.contractAddress, abi: art.abi, name: art.name, receipt };
}

export function decodeRevert(error, abi) {
  const raw = error?.walk?.((e) => typeof e?.data === 'string' && e.data.startsWith('0x'))?.data;
  if (raw && raw.length >= 10) {
    try {
      const decoded = viem.decodeErrorResult({ abi, data: raw });
      if (decoded.errorName === 'Error') return String(decoded.args[0]);
      return decoded.errorName;
    } catch { /* fall through */ }
  }
  return revertReason(error);
}

export function revertReason(error) {
  if (error instanceof BaseError) {
    const revert = error.walk((item) => item instanceof ContractFunctionRevertedError);
    if (revert) {
      if (revert.data?.errorName && revert.data.errorName !== 'Error') return revert.data.errorName;
      if (revert.reason) return revert.reason;
      if (revert.data?.args?.[0]) return String(revert.data.args[0]);
    }
    return error.shortMessage ?? error.message;
  }
  return String(error);
}

// Simulate first so that a rejected call never mines a block; a rejected
// lifecycle request therefore leaves state and the event log unchanged.
export async function tryWrite({ client, wallet, contract, functionName, args = [], at }) {
  // Encoding errors are harness errors, never evidence of a contract rejection.
  const data = viem.encodeFunctionData({ abi: contract.abi, functionName, args });
  const input = { from: wallet.account.address, to: contract.address, contract: contract.name, functionName, args, data, at };
  try {
    // Simulate in the environment of the block that will include the call
    // (its timestamp is pinned below), so time-dependent guards are exact.
    await client.call({
      account: wallet.account,
      to: contract.address,
      data,
      ...(at !== undefined ? { blockOverrides: { time: BigInt(at) } } : {}),
    });
  } catch (error) {
    // viem wraps JSON-RPC execution reverts in an error cause chain. Only the
    // EVM's execution-reverted code (3) or a typed revert qualifies. Transport,
    // rate-limit, timeout and encoding failures must abort the experiment.
    if (!isEvmRevert(error)) throw error;
    const result = { status: 'rejected', stage: 'eth_call', reason: decodeRevert(error, contract.abi) };
    await record(client, { kind: 'simulated-rejection', input, ...result,
      error: { name: error.name, message: error.message, details: error.details } });
    return result;
  }
  if (at !== undefined) await setNextTimestamp(client, at);
  const hash = await wallet.writeContract({ address: contract.address, abi: contract.abi, functionName, args, gas: 3_000_000n });
  const receipt = await receiptOf(client, hash, functionName);
  invariant(receipt.status === 'success', `${functionName}: mined but reverted`);
  await recordReceipt(client, receipt, input);
  return { status: 'accepted', receipt };
}

export function isEvmRevert(error) {
  for (let cause = error; cause; cause = cause.cause) {
    if (cause instanceof ContractFunctionRevertedError || cause instanceof viem.ExecutionRevertedError) return true;
    if (cause.code === 3 && /execution reverted/i.test(cause.message ?? '')) return true;
  }
  return false;
}

export async function mustWrite(opts) {
  const result = await tryWrite(opts);
  invariant(result.status === 'accepted', `${opts.functionName} rejected: ${result.reason}`);
  return result.receipt;
}

export function decodeLogs(rawLogs, contracts) {
  const byAddress = new Map(contracts.map((c) => [lower(c.address), c]));
  return rawLogs.map((log) => {
    const contract = byAddress.get(lower(log.address));
    invariant(contract, `log from unknown contract ${log.address}`);
    const decoded = decodeEventLog({ abi: contract.abi, data: log.data, topics: log.topics, strict: true });
    return {
      contractName: contract.name,
      contractAddress: lower(log.address),
      eventName: decoded.eventName,
      args: jsonValue(decoded.args),
      blockNumber: BigInt(log.blockNumber),
      transactionHash: lower(log.transactionHash),
      logIndex: Number(BigInt(log.logIndex)),
      topics: log.topics.map(lower),
      data: lower(log.data),
    };
  }).sort((a, b) => Number(a.blockNumber - b.blockNumber) || a.logIndex - b.logIndex);
}

export async function getLogsPaged(client, addresses, fromBlock, toBlock, pageSize = 2000n) {
  const out = [];
  for (let start = fromBlock; start <= toBlock; start += pageSize) {
    const end = start + pageSize - 1n < toBlock ? start + pageSize - 1n : toBlock;
    const page = await client.request({
      method: 'eth_getLogs',
      params: [{ address: addresses, fromBlock: toHex(start), toBlock: toHex(end) }],
    });
    out.push(...page);
  }
  return out;
}

export function rawLogBytes(logs) {
  return logs.reduce((sum, log) => sum + 32 * log.topics.length + (log.data.length - 2) / 2, 0);
}

export async function storageSlots(client, addresses) {
  const dumpHex = await client.request({ method: 'anvil_dumpState', params: [] });
  const json = JSON.parse(gunzipSync(Buffer.from(dumpHex.slice(2), 'hex')).toString());
  const accounts = json.accounts ?? {};
  // Preserve slot keys/values, not merely the count. Exclude funded EOA state.
  await record(client, { kind: 'storage', accounts: Object.fromEntries(Object.entries(accounts)
    .filter(([addr]) => addresses.map(lower).includes(lower(addr)))) });
  const result = {};
  for (const addr of addresses) {
    const entry = Object.entries(accounts).find(([key]) => lower(key) === lower(addr));
    const storage = entry ? entry[1].storage ?? {} : {};
    result[lower(addr)] = Object.values(storage).filter((v) => BigInt(v) !== 0n).length;
  }
  return result;
}

export function mean(values) {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : NaN;
}

// Sample standard deviation (n - 1); 0 for a single value.
export function sd(values) {
  if (values.length < 2) return 0;
  const m = mean(values);
  return Math.sqrt(values.reduce((acc, v) => acc + (v - m) ** 2, 0) / (values.length - 1));
}

// Deterministic PRNG (SplitMix64) for workload generation.
export function splitmix64(seed) {
  let state = BigInt.asUintN(64, BigInt(seed));
  return function next() {
    state = BigInt.asUintN(64, state + 0x9e3779b97f4a7c15n);
    let z = state;
    z = BigInt.asUintN(64, (z ^ (z >> 30n)) * 0xbf58476d1ce4e5b9n);
    z = BigInt.asUintN(64, (z ^ (z >> 27n)) * 0x94d049bb133111ebn);
    return BigInt.asUintN(64, z ^ (z >> 31n));
  };
}

export function makeRng(seed) {
  const next = splitmix64(seed);
  return {
    int(maxExclusive) { return Number(next() % BigInt(maxExclusive)); },
    bigint(minInclusive, maxInclusive) { return minInclusive + (next() % (maxInclusive - minInclusive + 1n)); },
    pick(items) { return items[Number(next() % BigInt(items.length))]; },
    weighted(entries) {
      const total = entries.reduce((s, [, w]) => s + w, 0);
      let r = Number(next() % BigInt(total));
      for (const [value, w] of entries) { if (r < w) return value; r -= w; }
      return entries.at(-1)[0];
    },
  };
}

// Contract-view projection in the exact normalized shape of replay-engine.
export async function readChainProjection(client, fund, nav, genesis, blockNumber, fundId) {
  const read = (c, fn, a = []) => client.readContract({ address: c.address, abi: c.abi, functionName: fn, args: a, blockNumber });
  const field = (v, name, i) => v[name] ?? v[i];
  const [totalSupply, subN, redN, totalQueued, paused] = await Promise.all([
    read(fund, 'totalSupply'), read(fund, 'subscriptionRequestCount'), read(fund, 'redemptionRequestCount'), read(fund, 'totalQueuedRedemption'), read(fund, 'paused'),
  ]);
  const balances = {}; const whitelist = {}; const queuedRedemption = {};
  for (const actor of [...genesis.actors].sort()) {
    const [b, e, q] = await Promise.all([read(fund, 'balanceOf', [actor]), read(fund, 'whitelist', [actor]), read(fund, 'queuedRedemptionOf', [actor])]);
    balances[actor] = b.toString(); whitelist[actor] = e; queuedRedemption[actor] = q.toString();
  }
  const roles = {};
  for (const r of genesis.roles) {
    const c = r.contractName === 'FundToken' ? fund : nav;
    roles[`${r.contractName}:${r.role.toLowerCase()}:${r.account}`] = await read(c, 'hasRole', [r.role, r.account]);
  }
  const navHistory = [];
  const len = await read(nav, 'historyLength', [fundId]);
  for (let i = 0n; i < len; i += 1n) {
    const v = await read(nav, 'navAt', [fundId, i]);
    navHistory.push({ nav: String(field(v, 'nav', 0)), netAssetValue: String(field(v, 'netAssetValue', 1)), totalSharesSnapshot: String(field(v, 'totalSharesSnapshot', 2)), asOf: String(field(v, 'asOf', 3)), storedAt: String(field(v, 'storedAt', 4)), navAdjustmentBps: String(field(v, 'navAdjustmentBps', 5)), payloadHash: String(field(v, 'payloadHash', 6)).toLowerCase(), isInitial: Boolean(field(v, 'isInitial', 7)) });
  }
  const subscriptions = [];
  for (let i = 0n; i < subN; i += 1n) {
    const v = await read(fund, 'subscriptionRequestAt', [i]);
    subscriptions.push({ investor: lower(field(v, 'investor', 0)), subscriptionAmount: String(field(v, 'subscriptionAmount', 1)), mintedShares: String(field(v, 'mintedShares', 2)), navUsed: String(field(v, 'navUsed', 3)), navAsOf: String(field(v, 'navAsOf', 4)), requestedAt: String(field(v, 'requestedAt', 5)), acceptedAt: String(field(v, 'acceptedAt', 6)), requestHash: String(field(v, 'requestHash', 7)).toLowerCase(), accepted: Boolean(field(v, 'accepted', 8)) });
  }
  const redemptions = [];
  for (let i = 0n; i < redN; i += 1n) {
    const v = await read(fund, 'redemptionRequestAt', [i]);
    redemptions.push({ investor: lower(field(v, 'investor', 0)), redeemedShares: String(field(v, 'redeemedShares', 1)), redemptionAmount: String(field(v, 'redemptionAmount', 2)), settlementNav: String(field(v, 'settlementNav', 3)), settlementNavAsOf: String(field(v, 'settlementNavAsOf', 4)), requestedAt: String(field(v, 'requestedAt', 5)), settledAt: String(field(v, 'settledAt', 6)), delayedAt: String(field(v, 'delayedAt', 7)), delayReasonHash: String(field(v, 'delayReasonHash', 8)).toLowerCase(), settled: Boolean(field(v, 'settled', 9)), delayed: Boolean(field(v, 'delayed', 10)) });
  }
  return {
    totalSupply: totalSupply.toString(), subscriptionRequestCount: subN.toString(), redemptionRequestCount: redN.toString(), totalQueuedRedemption: totalQueued.toString(),
    balances, whitelist, queuedRedemption, paused,
    roles: Object.fromEntries(Object.entries(roles).sort()),
    navHistory, subscriptions, redemptions,
  };
}

