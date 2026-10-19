// Part B of the v3 pre-registration: scale and stress runs on the production
// contracts. Usage: node run-scale.mjs [targets=100,1000,10000] [seeds=1,2,3]
import { resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import {
  E18, EVAL_DIR, GENESIS_TIMESTAMP, RESULTS_DIR, ZERO_ROLE,
  account, artifact, decodeLogs, deploy, getLogsPaged, gitHead, invariant, lower, makeRng,
  mean, mustWrite, rawLogBytes, sd, sha256, sha256File, startAnvil, storageSlots, toolVersions,
  tryWrite, viem, writeJson, readChainProjection,
} from './common.mjs';
import { applyReplayEvent, createReplayState, finalizeNavReferences, normalizedProjection } from '../replay-engine.mjs';

const { keccak256, stringToHex, toHex } = viem;
const ROLE = {
  PAUSER_ROLE: keccak256(stringToHex('PAUSER_ROLE')),
  SUBSCRIPTION_ROLE: keccak256(stringToHex('SUBSCRIPTION_ROLE')),
  REDEMPTION_ROLE: keccak256(stringToHex('REDEMPTION_ROLE')),
  MANAGER_ROLE: keccak256(stringToHex('MANAGER_ROLE')),
};
const FUND_ID = keccak256(stringToHex('OTC_FUND_SCALE_V3'));
const INVESTOR_COUNT = 24;
const STEP_SEC = 60;
const WEIGHTS = {
  subscriptionRequest: 14, subscriptionAcceptance: 14, transfer: 18, redemptionRequest: 12,
  redemptionSettlement: 12, settlementDelay: 2, navSubmission: 10, qualificationUpdate: 8,
  pauseResume: 4, roleUpdate: 2,
};

const args = process.argv.slice(2);
const TARGETS = (args[0] ?? '100,1000,10000').split(',').map(Number);
const SEEDS = (args[1] ?? '1,2,3').split(',').map(Number);

async function runOne(target, seed, port) {
  // Views are read live, so Anvil need not spill historical states to disk.
  const env = await startAnvil(port, { accounts: 4 + INVESTOR_COUNT, extraArgs: ['--max-persisted-states', '0'] });
  const rng = makeRng(seed * 1_000_003 + target);
  const admin = account(0); const manager = account(1); const operator2 = account(2);
  const investors = Array.from({ length: INVESTOR_COUNT }, (_, i) => account(4 + i));
  const w = (a) => env.walletFor(a);
  let clock = GENESIS_TIMESTAMP + 10;
  const tick = () => { clock += STEP_SEC; return clock; };
  try {
    const [navArt, fundArt, riskArt] = await Promise.all([artifact('NAVRegistry'), artifact('FundToken'), artifact('RiskRegistry')]);
    const nav = await deploy({ client: env.client, wallet: w(admin), art: navArt, args: [admin.address], at: tick() });
    const fund = await deploy({ client: env.client, wallet: w(admin), art: fundArt, args: [admin.address, 'OTC Fund Scale', 'OTCS', FUND_ID, nav.address], at: tick() });
    const risk = await deploy({ client: env.client, wallet: w(admin), art: riskArt, args: [admin.address, [1667, 1667, 1667, 1667, 1666, 1666], 30 * 24 * 3600, 7000], at: tick() });
    const bootstrap = [nav.receipt, fund.receipt, risk.receipt];
    const boot = async (contract, fn, a) => bootstrap.push(await mustWrite({ client: env.client, wallet: w(admin), contract, functionName: fn, args: a, at: tick() }));
    await boot(fund, 'setRiskGate', [risk.address]);
    await boot(fund, 'grantRole', [ROLE.SUBSCRIPTION_ROLE, admin.address]);
    await boot(fund, 'grantRole', [ROLE.REDEMPTION_ROLE, admin.address]);
    await boot(nav, 'grantRole', [ROLE.MANAGER_ROLE, manager.address]);
    const firstLifecycleBlock = bootstrap.at(-1).blockNumber + 1n;
    const roleAccounts = [admin, operator2];
    const genesis = {
      chainId: 31337, genesisTimestamp: GENESIS_TIMESTAMP, fundId: FUND_ID,
      actors: [admin, manager, operator2, ...investors].map((a) => lower(a.address)),
      roles: [
        { contractName: 'FundToken', role: ZERO_ROLE, account: lower(admin.address), enabled: true },
        { contractName: 'FundToken', role: ROLE.PAUSER_ROLE, account: lower(admin.address), enabled: true },
        { contractName: 'FundToken', role: ROLE.SUBSCRIPTION_ROLE, account: lower(admin.address), enabled: true },
        { contractName: 'FundToken', role: ROLE.REDEMPTION_ROLE, account: lower(admin.address), enabled: true },
        { contractName: 'FundToken', role: ROLE.SUBSCRIPTION_ROLE, account: lower(operator2.address), enabled: false },
        { contractName: 'NAVRegistry', role: ZERO_ROLE, account: lower(admin.address), enabled: true },
        { contractName: 'NAVRegistry', role: ROLE.MANAGER_ROLE, account: lower(manager.address), enabled: true },
      ],
    };
    const deploymentGas = { NAVRegistry: Number(nav.receipt.gasUsed), FundToken: Number(fund.receipt.gasUsed), RiskRegistry: Number(risk.receipt.gasUsed) };

    // Generator-side state model (only used to choose valid operations).
    const S = {
      eligible: new Map(investors.map((a) => [lower(a.address), false])),
      balance: new Map(investors.map((a) => [lower(a.address), 0n])),
      queued: new Map(investors.map((a) => [lower(a.address), 0n])),
      pendingSubs: [], pendingReds: [], subCount: 0, redCount: 0,
      navCount: 0, nav: E18, supply: 0n, paused: false, op2Role: false,
    };
    const ops = []; let events = 0;
    const record = (type, receipt) => {
      const lifecycleLogs = receipt.logs.filter((l) => [lower(fund.address), lower(nav.address)].includes(lower(l.address)));
      events += lifecycleLogs.length;
      ops.push({ type, gasUsed: Number(receipt.gasUsed), events: lifecycleLogs.length, blockNumber: receipt.blockNumber });
    };
    // Checkpoints: the first operation at which cumulative events reach each
    // tenth of the target, plus the final operation. Views are read live at
    // that block because Anvil does not retain arbitrarily old state.
    const checkpoints = [];
    let nextThreshold = 1;
    const exec = async (type, wallet, contract, fn, a) => {
      const result = await tryWrite({ client: env.client, wallet, contract, functionName: fn, args: a, at: tick() });
      invariant(result.status === 'accepted', `seed ${seed} op ${ops.length} ${type}/${fn} rejected: ${result.reason}`);
      record(type, result.receipt);
      if (nextThreshold <= 10 && events >= (nextThreshold * target) / 10) {
        while (nextThreshold <= 10 && events >= (nextThreshold * target) / 10) nextThreshold += 1;
        checkpoints.push({ opIndex: ops.length - 1, block: result.receipt.blockNumber, view: await readChainProjection(env.client, fund, nav, genesis, result.receipt.blockNumber, FUND_ID) });
      }
      return result.receipt;
    };
    const available = (addr) => S.balance.get(addr) - S.queued.get(addr);
    const eligibleList = () => investors.filter((a) => S.eligible.get(lower(a.address)));

    const doAccept = async (req) => {
      await exec('subscriptionAcceptance', w(admin), fund, 'acceptSubscription', [BigInt(req.id)]);
      const shares = (req.amount * E18) / S.nav;
      S.balance.set(req.investor, S.balance.get(req.investor) + shares); S.supply += shares;
      S.pendingSubs = S.pendingSubs.filter((x) => x.id !== req.id);
    };
    const doSettle = async (req) => {
      await exec('redemptionSettlement', w(admin), fund, 'settleRedemption', [BigInt(req.id)]);
      S.balance.set(req.investor, S.balance.get(req.investor) - req.shares);
      S.queued.set(req.investor, S.queued.get(req.investor) - req.shares); S.supply -= req.shares;
      S.pendingReds = S.pendingReds.filter((x) => x.id !== req.id);
    };
    const acceptable = () => S.pendingSubs.filter((r) => S.eligible.get(r.investor) && S.navCount > 0 && (r.amount * E18) / S.nav > 0n);
    const settleable = () => S.pendingReds.filter((r) => (r.shares * S.nav) / E18 > 0n);

    while (events < target) {
      const holders = eligibleList().filter((a) => available(lower(a.address)) > 0n);
      const feasible = [];
      if (eligibleList().length > 0) feasible.push(['subscriptionRequest', WEIGHTS.subscriptionRequest]);
      if (!S.paused && acceptable().length > 0) feasible.push(['subscriptionAcceptance', WEIGHTS.subscriptionAcceptance]);
      if (!S.paused && holders.length > 0 && eligibleList().length > 1) feasible.push(['transfer', WEIGHTS.transfer]);
      if (holders.length > 0) feasible.push(['redemptionRequest', WEIGHTS.redemptionRequest]);
      if (!S.paused && settleable().length > 0) feasible.push(['redemptionSettlement', WEIGHTS.redemptionSettlement]);
      if (S.pendingReds.some((r) => !r.delayed)) feasible.push(['settlementDelay', WEIGHTS.settlementDelay]);
      if (S.navCount === 0 || S.supply > 0n) feasible.push(['navSubmission', WEIGHTS.navSubmission]);
      feasible.push(['qualificationUpdate', WEIGHTS.qualificationUpdate]);
      if (S.navCount > 0) feasible.push(['pauseResume', WEIGHTS.pauseResume]);
      feasible.push(['roleUpdate', WEIGHTS.roleUpdate]);
      const choice = rng.weighted(feasible);

      if (choice === 'subscriptionRequest') {
        const inv = rng.pick(eligibleList());
        const amount = rng.bigint(1_000n, 100_000n) * E18;
        const self = rng.int(2) === 0;
        if (self) await exec('subscriptionRequest', w(inv), fund, 'requestSubscription', [amount]);
        else await exec('subscriptionRequest', w(admin), fund, 'requestSubscriptionFor', [inv.address, amount]);
        S.pendingSubs.push({ id: S.subCount, investor: lower(inv.address), amount }); S.subCount += 1;
      } else if (choice === 'subscriptionAcceptance') {
        await doAccept(rng.pick(acceptable()));
      } else if (choice === 'transfer') {
        const from = rng.pick(holders);
        const to = rng.pick(eligibleList().filter((a) => lower(a.address) !== lower(from.address)));
        const amount = (available(lower(from.address)) * BigInt(1 + rng.int(100))) / 100n || 1n;
        await exec('transfer', w(from), fund, 'transfer', [to.address, amount]);
        S.balance.set(lower(from.address), S.balance.get(lower(from.address)) - amount);
        S.balance.set(lower(to.address), S.balance.get(lower(to.address)) + amount);
      } else if (choice === 'redemptionRequest') {
        const inv = rng.pick(holders);
        const shares = (available(lower(inv.address)) * BigInt(1 + rng.int(100))) / 100n || 1n;
        const self = rng.int(2) === 0;
        if (self) await exec('redemptionRequest', w(inv), fund, 'requestRedemption', [shares]);
        else await exec('redemptionRequest', w(admin), fund, 'requestRedemptionFor', [inv.address, shares]);
        S.queued.set(lower(inv.address), S.queued.get(lower(inv.address)) + shares);
        S.pendingReds.push({ id: S.redCount, investor: lower(inv.address), shares, delayed: false }); S.redCount += 1;
      } else if (choice === 'redemptionSettlement') {
        await doSettle(rng.pick(settleable()));
      } else if (choice === 'settlementDelay') {
        const req = rng.pick(S.pendingReds.filter((r) => !r.delayed));
        await exec('settlementDelay', w(admin), fund, 'flagSettlementDelayed', [BigInt(req.id), keccak256(stringToHex(`DELAY_${req.id}`))]);
        req.delayed = true;
      } else if (choice === 'navSubmission') {
        const asOf = BigInt(clock); // timestamp of the latest mined block, <= next block time
        if (S.navCount === 0) {
          await exec('navSubmission', w(manager), nav, 'postInitialNAV', [FUND_ID, E18, asOf, keccak256(stringToHex(`NAV_${S.navCount}`))]);
          S.nav = E18;
        } else {
          const bps = BigInt(rng.int(401)) - 200n; // NAV moves within +/-2%
          const target = (S.nav * (10_000n + bps)) / 10_000n;
          const netAssetValue = (S.supply * target) / E18;
          await exec('navSubmission', w(manager), nav, 'postNAV', [FUND_ID, netAssetValue, S.supply, asOf, keccak256(stringToHex(`NAV_${S.navCount}`))]);
          S.nav = (netAssetValue * E18) / S.supply;
        }
        S.navCount += 1;
      } else if (choice === 'qualificationUpdate') {
        const candidates = investors.filter((a) => !S.eligible.get(lower(a.address)) || !S.pendingSubs.some((r) => r.investor === lower(a.address)));
        const inv = rng.pick(candidates);
        const next = !S.eligible.get(lower(inv.address)) ? true : rng.int(4) !== 0 ? true : false;
        await exec('qualificationUpdate', w(admin), fund, 'setWhitelisted', [inv.address, next, keccak256(stringToHex(`CDD_${lower(inv.address)}_${ops.length}`))]);
        S.eligible.set(lower(inv.address), next);
      } else if (choice === 'pauseResume') {
        for (const req of [...acceptable()]) await doAccept(req); // drain before pause
        for (const req of [...settleable()]) await doSettle(req);
        await exec('pauseResume', w(admin), fund, 'pause', []); S.paused = true;
        await exec('pauseResume', w(admin), fund, 'unpause', []); S.paused = false;
      } else if (choice === 'roleUpdate') {
        await exec('roleUpdate', w(admin), fund, 'grantRole', [ROLE.SUBSCRIPTION_ROLE, operator2.address]);
        await exec('roleUpdate', w(admin), fund, 'revokeRole', [ROLE.SUBSCRIPTION_ROLE, operator2.address]);
      }
    }
    const lastBlock = ops.at(-1).blockNumber;
    const contracts = [{ ...fund, name: 'FundToken' }, { ...nav, name: 'NAVRegistry' }, { ...risk, name: 'RiskRegistry' }];
    const addresses = contracts.map((c) => c.address);

    // Storage at end of run
    const slots = await storageSlots(env.client, addresses);

    // Log retrieval latency (5 repetitions) and index sizes
    const fetchTimes = []; let raw;
    for (let r = 0; r < 5; r += 1) {
      const t0 = performance.now();
      raw = await getLogsPaged(env.client, addresses, firstLifecycleBlock, lastBlock);
      fetchTimes.push(performance.now() - t0);
    }
    const decoded = decodeLogs(raw, contracts);
    invariant(decoded.length === events, `event count mismatch ${decoded.length} vs ${events}`);
    const jsonl = decoded.map((e) => JSON.stringify({ ...e, blockNumber: e.blockNumber.toString() })).join('\n');

    // Replay latency (1 warm-up + 10 timed) with the sealed replay engine
    const replayAll = () => {
      const state = createReplayState(genesis);
      const refs = [];
      for (const e of decoded) refs.push(...applyReplayEvent(state, e));
      return { state, refs };
    };
    replayAll();
    const replayTimes = [];
    let final;
    for (let r = 0; r < 10; r += 1) {
      const t0 = performance.now();
      final = replayAll();
      replayTimes.push(performance.now() - t0);
    }
    const navRefs = finalizeNavReferences(final.state, final.refs);

    // Correctness at scale: ARC, NRI, PCR at the live checkpoints (+ final).
    if (checkpoints.at(-1)?.opIndex !== ops.length - 1) {
      checkpoints.push({ opIndex: ops.length - 1, block: lastBlock, view: await readChainProjection(env.client, fund, nav, genesis, lastBlock, FUND_ID) });
    }
    let pcrMatched = 0;
    const replayState = createReplayState(genesis);
    let cursor = 0;
    for (const cp of checkpoints) {
      while (cursor < decoded.length && decoded[cursor].blockNumber <= cp.block) { applyReplayEvent(replayState, decoded[cursor]); cursor += 1; }
      if (JSON.stringify(normalizedProjection(replayState)) === JSON.stringify(cp.view)) pcrMatched += 1;
    }
    const checkpointIdx = checkpoints;
    const byType = {};
    for (const op of ops) (byType[op.type] ??= []).push(op.gasUsed);
    const totalGas = ops.reduce((s, o) => s + o.gasUsed, 0);
    const eventsByType = {};
    for (const e of decoded) eventsByType[e.eventName] = (eventsByType[e.eventName] ?? 0) + 1;
    return {
      target, seed, investors: INVESTOR_COUNT,
      transactions: ops.length, acceptedEvents: decoded.length, eventsByType,
      operationsByType: Object.fromEntries(Object.entries(byType).map(([k, v]) => [k, v.length])),
      gas: {
        total: totalGas, perTransaction: totalGas / ops.length, perEvent: totalGas / decoded.length,
        byType: Object.fromEntries(Object.entries(byType).map(([k, v]) => [k, { n: v.length, mean: mean(v), sd: sd(v), min: Math.min(...v), max: Math.max(...v) }])),
      },
      deploymentGas,
      storage: { nonZeroSlots: Object.fromEntries(contracts.map((c) => [c.name, slots[lower(c.address)]])), totalNonZeroSlots: Object.values(slots).reduce((a, b) => a + b, 0) },
      eventIndex: { logs: raw.length, rawPayloadBytes: rawLogBytes(raw), normalizedJsonlBytes: Buffer.byteLength(jsonl) },
      latencyMs: {
        getLogs: { repetitions: 5, mean: mean(fetchTimes), sd: sd(fetchTimes) },
        replay: { repetitions: 10, mean: mean(replayTimes), sd: sd(replayTimes) },
      },
      correctness: {
        arc: { replayed: decoded.length, accepted: events },
        nri: { valid: navRefs.filter((r) => r.valid).length, total: navRefs.length },
        pcr: { matched: pcrMatched, checkpoints: checkpointIdx.length },
        finalProjectionSha256: sha256(JSON.stringify(normalizedProjection(final.state))),
      },
    };
  } finally {
    await env.stop();
  }
}

async function main() {
  const provenance = {
    ...gitHead(),
    planSha256: await sha256File(resolve(EVAL_DIR, 'spec-v3/evaluation-plan.v3.md')),
    tools: toolVersions(),
    weights: WEIGHTS, investors: INVESTOR_COUNT, stepSec: STEP_SEC,
    checkpointRule: 'PCR checkpoints are the first operations at which cumulative accepted events reach k/10 of the target (k = 1..10), plus the final operation; contract views are read live at those blocks because Anvil does not retain old historical state.',
    runAt: new Date().toISOString(),
  };
  const runs = [];
  let port = 18700;
  for (const target of TARGETS) {
    for (const seed of SEEDS) {
      const t0 = performance.now();
      const run = await runOne(target, seed, port);
      port += 1;
      run.wallClockSec = (performance.now() - t0) / 1000;
      runs.push(run);
      console.log(JSON.stringify({ target, seed, tx: run.transactions, events: run.acceptedEvents, gasPerEvent: Math.round(run.gas.perEvent), slots: run.storage.totalNonZeroSlots, rawBytes: run.eventIndex.rawPayloadBytes, replayMs: run.latencyMs.replay.mean.toFixed(2), arc: run.correctness.arc, nri: run.correctness.nri, pcr: run.correctness.pcr, wall: run.wallClockSec.toFixed(1) }));
      await writeJson(resolve(RESULTS_DIR, `B-scale-run-${target}-s${seed}.json`), run);
    }
  }
  const metric = (rs, f) => { const v = rs.map(f); return { mean: mean(v), sd: sd(v), values: v }; };
  const aggregate = TARGETS.map((target) => {
    const rs = runs.filter((r) => r.target === target);
    return {
      target, replicates: rs.length,
      transactions: metric(rs, (r) => r.transactions),
      acceptedEvents: metric(rs, (r) => r.acceptedEvents),
      totalGas: metric(rs, (r) => r.gas.total),
      gasPerTransaction: metric(rs, (r) => r.gas.perTransaction),
      gasPerEvent: metric(rs, (r) => r.gas.perEvent),
      storageSlots: metric(rs, (r) => r.storage.totalNonZeroSlots),
      storageSlotsPerTransaction: metric(rs, (r) => r.storage.totalNonZeroSlots / r.transactions),
      rawPayloadBytes: metric(rs, (r) => r.eventIndex.rawPayloadBytes),
      rawPayloadBytesPerEvent: metric(rs, (r) => r.eventIndex.rawPayloadBytes / r.acceptedEvents),
      normalizedJsonlBytes: metric(rs, (r) => r.eventIndex.normalizedJsonlBytes),
      getLogsMs: metric(rs, (r) => r.latencyMs.getLogs.mean),
      replayMs: metric(rs, (r) => r.latencyMs.replay.mean),
      replayUsPerEvent: metric(rs, (r) => (1000 * r.latencyMs.replay.mean) / r.acceptedEvents),
      replayWithinRunSd: rs.map((r) => r.latencyMs.replay.sd),
      arcAll: rs.every((r) => r.correctness.arc.replayed === r.correctness.arc.accepted),
      nriAll: rs.every((r) => r.correctness.nri.valid === r.correctness.nri.total),
      pcrAll: rs.every((r) => r.correctness.pcr.matched === r.correctness.pcr.checkpoints),
      nri: rs.map((r) => r.correctness.nri), pcr: rs.map((r) => r.correctness.pcr),
      gasByType: Object.fromEntries([...new Set(rs.flatMap((r) => Object.keys(r.gas.byType)))].map((t) => {
        const all = rs.flatMap((r) => (r.gas.byType[t] ? [r.gas.byType[t]] : []));
        const n = all.reduce((s, x) => s + x.n, 0);
        const m = all.reduce((s, x) => s + x.mean * x.n, 0) / n;
        return [t, { n, pooledMean: m, runMeans: all.map((x) => x.mean), runSds: all.map((x) => x.sd) }];
      })),
    };
  });
  const summaryHash = await writeJson(resolve(RESULTS_DIR, 'B-scale-summary.json'), { experiment: 'paper85-v3-part-B-scale', provenance, aggregate, runFiles: runs.map((r) => `B-scale-run-${r.target}-s${r.seed}.json`) });
  console.log(JSON.stringify({ summaryHash }));
}

await main();
