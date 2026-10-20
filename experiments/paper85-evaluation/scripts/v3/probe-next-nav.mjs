// Post-review counterexample: two regular NAVs follow one order. The frozen
// contract accepts using the second; the original asOf proxy misses the gap.
import { resolve } from 'node:path';
import { E18, RESULTS_DIR, ZERO_ROLE, account, artifact, decodeLogs, deploy, invariant,
  lower, mustWrite, startAnvil, viem, writeJson } from './common.mjs';
import { save } from './evidence.mjs';
import { auditPricing } from './audit-pricing.mjs';
import { applyReplayEvent, createReplayState, finalizeNavReferences, normalizedProjection } from '../replay-engine.mjs';
const h = (s) => viem.keccak256(viem.stringToHex(s));
const FUND = h('NEXT_NAV_COUNTEREXAMPLE');
const env = await startAnvil(18960, { accounts: 2 });
try {
  const [admin, investor] = [0, 1].map(account);
  const wallet = env.walletFor(admin);
  let time = 1710000010;
  const next = () => time += 60;
  const nav = await deploy({ client: env.client, wallet, art: await artifact('NAVRegistry'), args: [admin.address], at: next() });
  const fund = await deploy({ client: env.client, wallet, art: await artifact('FundToken'), args: [admin.address, 'Next NAV probe', 'NNP', FUND, nav.address], at: next() });
  const call = (contract, functionName, args, who = admin) => mustWrite({ client: env.client, wallet: env.walletFor(who), contract, functionName, args, at: next() });
  await call(fund, 'grantRole', [h('SUBSCRIPTION_ROLE'), admin.address]);
  const fromBlock = await env.client.getBlockNumber() + 1n;
  await call(fund, 'setWhitelisted', [investor.address, true, h('CDD')]);
  await call(fund, 'requestSubscription', [100n * E18], investor);
  await call(nav, 'postInitialNAV', [FUND, E18, BigInt(time + 60), h('seed-NAV')]);
  await call(fund, 'acceptSubscription', [0n]);
  await call(fund, 'requestSubscription', [100n * E18], investor);
  await call(nav, 'postNAV', [FUND, 110n * E18, 100n * E18, BigInt(time + 60), h('first-computed')]);
  await call(nav, 'postNAV', [FUND, 120n * E18, 100n * E18, BigInt(time + 60), h('second-computed')]);
  await call(fund, 'acceptSubscription', [1n]);
  const contracts = [nav, fund];
  const raw = await env.client.request({ method: 'eth_getLogs', params: [{ address: contracts.map((c) => c.address), fromBlock: viem.toHex(fromBlock), toBlock: 'latest' }] });
  const decoded = decodeLogs(raw, contracts);
  const genesis = { fundId: FUND, actors: [admin, investor].map((a) => lower(a.address)), roles: [
    { contractName: 'FundToken', role: ZERO_ROLE, account: lower(admin.address), enabled: true },
    { contractName: 'FundToken', role: h('SUBSCRIPTION_ROLE'), account: lower(admin.address), enabled: true },
  ] };
  const state = createReplayState(genesis); const refs = [];
  for (const event of decoded) refs.push(...applyReplayEvent(state, event));
  const policy = { correctionIndices: [], suspensions: [] };
  const pricing = auditPricing(state, finalizeNavReferences(state, refs), policy);
  invariant(pricing.length === 2 && pricing[0].nextApplicableNavMatches && pricing[1].originalAsOfProxy && !pricing[1].nextApplicableNavMatches && pricing[1].reason === 'skipped-next-NAV', 'Counterexample failed');
  await save(resolve(RESULTS_DIR, 'next-nav/replay.json.gz'), { genesis, contracts: contracts.map(({ name, address, abi }) => ({ name, address, abi })), rawLogs: raw, decoded, checkpoints: [], pricingPolicy: policy, finalProjection: normalizedProjection(state) });
  await writeJson(resolve(RESULTS_DIR, 'E-next-nav-counterexample.json'), { status: 'detected', pricing, evidence: 'next-nav/replay.json.gz' });
  console.log('Skipped-next-NAV counterexample detected; original proxy passes.');
} finally { await env.stop(); }
