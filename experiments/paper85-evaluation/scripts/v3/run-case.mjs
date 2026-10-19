// Part C of the v3 pre-registration: real-world-grounded case on the
// production contracts. The audit questions Q1-Q7 are answered from the
// replayed event log and the genesis configuration only; contract views are
// read afterwards solely to check projection consistency (Q6).
import { resolve } from 'node:path';
import {
  E18, EVAL_DIR, GENESIS_TIMESTAMP, RESULTS_DIR, ZERO_ADDRESS, ZERO_ROLE,
  account, artifact, decodeLogs, deploy, gitHead, invariant, lower, mustWrite, readChainProjection,
  sha256, sha256File, startAnvil, toolVersions, tryWrite, viem, writeJson,
} from './common.mjs';
import { applyReplayEvent, createReplayState, finalizeNavReferences, normalizedProjection } from '../replay-engine.mjs';

const { keccak256, stringToHex, toHex } = viem;
const h = (label) => keccak256(stringToHex(label));
const ROLE = { PAUSER_ROLE: h('PAUSER_ROLE'), SUBSCRIPTION_ROLE: h('SUBSCRIPTION_ROLE'), REDEMPTION_ROLE: h('REDEMPTION_ROLE'), MANAGER_ROLE: h('MANAGER_ROLE') };
const FUND_ID = h('CASE_FUND_C_V3');
const DAY = 86_400;
const D0 = GENESIS_TIMESTAMP - (GENESIS_TIMESTAMP % DAY) + DAY; // first UTC midnight after genesis
const at = (day, hh, mm = 0) => D0 + day * DAY + hh * 3600 + mm * 60;
const units = (n) => BigInt(n) * E18;

const P = {
  admin: account(0),     // management company / compliance (DEFAULT_ADMIN_ROLE)
  registrar: account(1), // transfer agent (SUBSCRIPTION_ROLE, REDEMPTION_ROLE)
  navAgent: account(2),  // valuation agent (MANAGER_ROLE on NAVRegistry)
  board: account(3),     // board decision executed via PAUSER_ROLE
  A: account(4), B: account(5), C: account(6),
};
const NAME = Object.fromEntries(Object.entries(P).map(([k, v]) => [lower(v.address), k]));

async function main() {
  const env = await startAnvil(18800, { accounts: 8 });
  const w = (a) => env.walletFor(a);
  const log = [];
  try {
    const [navArt, fundArt, riskArt] = await Promise.all([artifact('NAVRegistry'), artifact('FundToken'), artifact('RiskRegistry')]);
    const nav = await deploy({ client: env.client, wallet: w(P.admin), art: navArt, args: [P.admin.address], at: at(0, 7) });
    const fund = await deploy({ client: env.client, wallet: w(P.admin), art: fundArt, args: [P.admin.address, 'Case Fund C', 'CFC', FUND_ID, nav.address], at: at(0, 7, 5) });
    const risk = await deploy({ client: env.client, wallet: w(P.admin), art: riskArt, args: [P.admin.address, [1667, 1667, 1667, 1667, 1666, 1666], 30 * DAY, 7000], at: at(0, 7, 10) });
    let bootMinute = 15;
    const boot = async (contract, fn, a) => mustWrite({ client: env.client, wallet: w(P.admin), contract, functionName: fn, args: a, at: at(0, 7, (bootMinute += 5)) });
    await boot(fund, 'setRiskGate', [risk.address]);
    await boot(fund, 'grantRole', [ROLE.SUBSCRIPTION_ROLE, P.registrar.address]);
    await boot(fund, 'grantRole', [ROLE.REDEMPTION_ROLE, P.registrar.address]);
    await boot(fund, 'grantRole', [ROLE.PAUSER_ROLE, P.board.address]);
    await boot(nav, 'grantRole', [ROLE.MANAGER_ROLE, P.navAgent.address]);
    const lastBoot = await env.client.getBlockNumber();

    let supply = 0n;
    const totalSupply = async () => env.client.readContract({ address: fund.address, abi: fund.abi, functionName: 'totalSupply' });
    const step = async (id, label, rule, who, contract, fn, a, time, expect) => {
      const result = await tryWrite({ client: env.client, wallet: w(P[who]), contract, functionName: fn, args: a, at: time });
      const entry = { id, label, rule, actor: who, call: fn, time, expected: expect, observed: result.status === 'accepted' ? 'accepted' : `rejected:${result.reason}` };
      entry.match = entry.observed === expect;
      if (result.receipt) { entry.blockNumber = result.receipt.blockNumber; entry.gasUsed = Number(result.receipt.gasUsed); }
      log.push(entry);
      return result;
    };
    const fs = fund; const nr = nav;
    const navPost = async (id, label, rule, target, asOf, time, shares, expect = 'accepted') => {
      const snap = shares ?? (supply = await totalSupply());
      const netAssetValue = (snap * target) / E18;
      return step(id, label, rule, 'navAgent', nr, 'postNAV', [FUND_ID, netAssetValue, snap, BigInt(asOf), h(`${id}:valuation-pack`)], time, expect);
    };

    // Onboarding (FATF R.10)
    await step('C01', 'CDD completed, investor A admitted', 'FATF R.10', 'admin', fs, 'setWhitelisted', [P.A.address, true, h('CDD-A-initial')], at(0, 9), 'accepted');
    await step('C02', 'CDD completed, investor B admitted', 'FATF R.10', 'admin', fs, 'setWhitelisted', [P.B.address, true, h('CDD-B-initial')], at(0, 9, 5), 'accepted');
    await step('C03', 'CDD completed, investor C admitted', 'FATF R.10', 'admin', fs, 'setWhitelisted', [P.C.address, true, h('CDD-C-initial')], at(0, 9, 10), 'accepted');
    // Initial offer priced at the issue NAV computed after the order (Rule 22c-1)
    await step('C04', 'A subscribes 1,000,000 in the initial offer', 'Rule 22c-1(a)', 'A', fs, 'requestSubscription', [units(1_000_000)], at(0, 10), 'accepted');
    await step('C05', 'Issue NAV 1.00 approved (asOf D0 17:00)', 'Rule 22c-1(b)', 'navAgent', nr, 'postInitialNAV', [FUND_ID, E18, BigInt(at(0, 17)), h('C05:valuation-pack')], at(0, 17), 'accepted');
    await step('C06', 'Registrar accepts A at the issue NAV', 'Rule 22c-1(a)', 'registrar', fs, 'acceptSubscription', [0n], at(0, 17, 30), 'accepted');
    // Forward-priced subscription
    await step('C07', 'B subscribes 500,000 (received D1 11:00)', 'Rule 22c-1(a)', 'B', fs, 'requestSubscription', [units(500_000)], at(1, 11), 'accepted');
    await navPost('C08', 'NAV D1 = 1.01 approved', 'Rule 22c-1(b)', 1_010_000_000_000_000_000n, at(1, 17), at(1, 17));
    await step('C09', 'Registrar accepts B at NAV D1', 'Rule 22c-1(a)', 'registrar', fs, 'acceptSubscription', [1n], at(1, 17, 30), 'accepted');
    // Backward-priced exception (accepted before the next NAV is computed)
    await step('C10', 'C subscribes 300,000 (received D2 09:30)', 'Rule 22c-1(a)', 'C', fs, 'requestSubscription', [units(300_000)], at(2, 9, 30), 'accepted');
    await step('C11', 'Registrar accepts C before NAV D2 exists (backward-priced exception)', 'Rule 22c-1(a)', 'registrar', fs, 'acceptSubscription', [2n], at(2, 10), 'accepted');
    // Forward-priced redemption settled at an erroneous NAV
    await step('C12', 'A requests redemption of 100,000 shares (D2 12:00)', 'Rule 22c-1(a)', 'A', fs, 'requestRedemption', [units(100_000)], at(2, 12), 'accepted');
    supply = await totalSupply();
    const d2Shares = supply;
    await navPost('C13', 'NAV D2 = 1.03 approved (later found erroneous)', 'Rule 22c-1(b)', 1_030_000_000_000_000_000n, at(2, 17), at(2, 17), d2Shares);
    await step('C14', 'Registrar settles A at NAV D2', 'Rule 22c-1(a)', 'registrar', fs, 'settleRedemption', [0n], at(2, 17, 30), 'accepted');
    // Restricted transfer and failed periodic review
    await step('C15', 'A transfers 50,000 shares to eligible B', 'transfer restriction', 'A', fs, 'transfer', [P.B.address, units(50_000)], at(3, 10), 'accepted');
    await step('C16', 'Periodic CDD review of C fails; eligibility revoked', 'FATF R.10', 'admin', fs, 'setWhitelisted', [P.C.address, false, h('CDD-C-review-failed')], at(3, 11), 'accepted');
    await step('C17', 'Revoked holder C requests redemption (controlled exit attempt)', 'FATF R.10', 'C', fs, 'requestRedemption', [units(10_000)], at(3, 11, 30), 'rejected:NOT_WHITELISTED');
    // Suspension of dealing (UCITS Art. 84)
    await step('C18', 'Board suspends dealing (valuation not possible)', 'UCITS Art. 84(2)(a)', 'board', fs, 'pause', [], at(3, 14), 'accepted');
    await step('C19', 'B requests redemption of 100,000 shares during suspension', 'UCITS Art. 84(2)(a)', 'B', fs, 'requestRedemption', [units(100_000)], at(3, 15), 'accepted');
    await step('C20', 'Registrar attempts settlement during suspension', 'UCITS Art. 84(2)(a)', 'registrar', fs, 'settleRedemption', [1n], at(3, 16), 'rejected:PAUSED');
    // NAV error correction (CSSF 24/856) and resumption
    await navPost('C21', 'Corrected NAV D2 = 1.02 (same asOf) approved', 'CSSF 24/856', 1_020_000_000_000_000_000n, at(2, 17), at(4, 9), d2Shares);
    supply = await totalSupply();
    await navPost('C22', 'NAV D4 = 1.025 approved', 'Rule 22c-1(b)', 1_025_000_000_000_000_000n, at(4, 17), at(4, 17));
    await step('C23', 'Board resumes dealing', 'UCITS Art. 84(2)(a)', 'board', fs, 'unpause', [], at(4, 17, 10), 'accepted');
    await step('C24', 'Registrar flags B settlement delayed (suspension backlog)', 'UCITS Art. 84(2)(a)', 'registrar', fs, 'flagSettlementDelayed', [1n, h('SUSPENSION-BACKLOG')], at(4, 17, 15), 'accepted');
    await step('C25', 'Registrar settles B at NAV D4', 'Rule 22c-1(a)', 'registrar', fs, 'settleRedemption', [1n], at(4, 17, 30), 'accepted');
    // Late correction probe
    await navPost('C26', 'Late correction of NAV D1 after NAV D4 exists', 'CSSF 24/856', 1_005_000_000_000_000_000n, at(1, 17), at(5, 9), units(1_000_000), 'rejected:AS_OF_BEFORE_LATEST');

    const accepted = log.filter((e) => e.observed === 'accepted');
    const lastBlock = accepted.at(-1).blockNumber;
    const contracts = [{ ...fund, name: 'FundToken' }, { ...nav, name: 'NAVRegistry' }, { ...risk, name: 'RiskRegistry' }];
    const raw = await env.client.request({ method: 'eth_getLogs', params: [{ address: contracts.map((c) => c.address), fromBlock: toHex(lastBoot + 1n), toBlock: toHex(lastBlock) }] });
    const events = decodeLogs(raw, contracts);

    // ------------------------------------------------------------------
    // Replay and audit queries (event log + genesis only)
    // ------------------------------------------------------------------
    const genesis = {
      chainId: 31337, genesisTimestamp: GENESIS_TIMESTAMP, fundId: FUND_ID,
      actors: Object.values(P).map((a) => lower(a.address)),
      roles: [
        { contractName: 'FundToken', role: ZERO_ROLE, account: lower(P.admin.address), enabled: true },
        { contractName: 'FundToken', role: ROLE.PAUSER_ROLE, account: lower(P.admin.address), enabled: true },
        { contractName: 'FundToken', role: ROLE.PAUSER_ROLE, account: lower(P.board.address), enabled: true },
        { contractName: 'FundToken', role: ROLE.SUBSCRIPTION_ROLE, account: lower(P.registrar.address), enabled: true },
        { contractName: 'FundToken', role: ROLE.REDEMPTION_ROLE, account: lower(P.registrar.address), enabled: true },
        { contractName: 'NAVRegistry', role: ROLE.MANAGER_ROLE, account: lower(P.navAgent.address), enabled: true },
      ],
    };
    const state = createReplayState(genesis);
    const navRefs = [];
    const eligibilityChecks = [];
    let window = null; const suspension = { shareMovements: 0, redemptionRequests: 0, subscriptionRequests: 0, navVersions: 0 };
    const navProvenance = [];
    const delays = [];
    const projections = new Map();
    for (const e of events) {
      // Q3: eligibility of counterparties immediately before each share movement
      if (e.eventName === 'Transfer') {
        const from = lower(e.args.from); const to = lower(e.args.to);
        const kind = from === ZERO_ADDRESS ? 'mint' : to === ZERO_ADDRESS ? 'burn' : 'transfer';
        const parties = kind === 'mint' ? [to] : kind === 'burn' ? [from] : [from, to];
        eligibilityChecks.push({ kind, parties: parties.map((p) => NAME[p]), eligible: parties.every((p) => state.whitelist[p]) });
        if (window) suspension.shareMovements += 1;
      }
      if (window && e.eventName === 'RedemptionRequested') suspension.redemptionRequests += 1;
      if (window && e.eventName === 'SubscriptionRequested') suspension.subscriptionRequests += 1;
      if (window && e.eventName === 'NAVUpdatedEvent') suspension.navVersions += 1;
      if (e.eventName === 'Paused') window = { start: e.blockNumber };
      if (e.eventName === 'Unpaused') { window.end = e.blockNumber; window = null; }
      if (e.eventName === 'NAVUpdatedEvent') {
        const prev = state.navHistory.at(-1);
        navProvenance.push({ index: state.navHistory.length, nav: e.args.nav, asOf: e.args.asOf, by: NAME[lower(e.args.by)], payloadHash: e.args.payloadHash, correctionOf: prev && prev.asOf === String(e.args.asOf) ? state.navHistory.length - 1 : null });
      }
      if (e.eventName === 'SettlementDelayed') delays.push({ requestId: e.args.requestId, investor: NAME[lower(e.args.investor)], reasonHash: e.args.reasonHash, requestedAt: Number(e.args.requestedAt), delayedAt: Number(e.args.delayedAt) });
      if (e.eventName === 'RedemptionSettled') { const d = delays.find((x) => x.requestId === e.args.requestId); if (d) d.settlementLagSec = Number(e.args.settledAt) - d.requestedAt; }
      navRefs.push(...applyReplayEvent(state, e).map((r) => ({ ...r, investor: null })));
      projections.set(e.blockNumber.toString(), normalizedProjection(state));
    }
    const finalizedRefs = finalizeNavReferences(state, navRefs);
    // Q1: forward pricing (NAV asOf strictly after order receipt)
    const q1 = [
      ...state.subscriptions.map((s, i) => [s, i]).filter(([s]) => s.accepted).map(([s, i]) => ({ type: 'subscription', requestId: i, investor: NAME[s.investor], requestedAt: Number(s.requestedAt), navAsOf: Number(s.navAsOf), forwardPriced: Number(s.navAsOf) > Number(s.requestedAt) })),
      ...state.redemptions.map((r, i) => [r, i]).filter(([r]) => r.settled).map(([r, i]) => ({ type: 'redemption', requestId: i, investor: NAME[r.investor], requestedAt: Number(r.requestedAt), navAsOf: Number(r.settlementNavAsOf), forwardPriced: Number(r.settlementNavAsOf) > Number(r.requestedAt) })),
    ];
    // Q2: requests processed at a NAV version later superseded by a same-asOf correction
    const superseded = new Set(navProvenance.filter((v) => v.correctionOf !== null).map((v) => v.correctionOf));
    const q2 = finalizedRefs.filter((r) => superseded.has(r.latestRecoverableNavIndex)).map((r) => ({ event: r.eventName, requestId: r.requestId, navIndex: r.latestRecoverableNavIndex, nav: r.referencedNav }));
    for (const item of q2) {
      const rec = item.event === 'RedemptionSettled' ? state.redemptions[Number(item.requestId)] : state.subscriptions[Number(item.requestId)];
      item.investor = NAME[rec.investor];
      const corrected = state.navHistory[item.navIndex + 1];
      if (item.event === 'RedemptionSettled') {
        item.paidAmount = rec.redemptionAmount;
        item.amountAtCorrectedNav = ((BigInt(rec.redeemedShares) * BigInt(corrected.nav)) / E18).toString();
        item.overpayment = (BigInt(rec.redemptionAmount) - BigInt(item.amountAtCorrectedNav)).toString();
      }
    }
    // Q6: projection consistency after every accepted operation
    let pcrMatched = 0;
    for (const entry of accepted) {
      const view = await readChainProjection(env.client, fund, nav, genesis, entry.blockNumber, FUND_ID);
      const replayed = projections.get(entry.blockNumber.toString());
      entry.projectionMatches = JSON.stringify(replayed) === JSON.stringify(view);
      if (entry.projectionMatches) pcrMatched += 1;
    }

    const answers = {
      Q1: { compliant: q1.filter((x) => x.forwardPriced).length, total: q1.length, exceptions: q1.filter((x) => !x.forwardPriced), detail: q1 },
      Q2: { affected: q2 },
      Q3: { movements: eligibilityChecks.length, eligibleAtTime: eligibilityChecks.filter((x) => x.eligible).length, detail: eligibilityChecks },
      Q4: suspension,
      Q5: { versions: navProvenance.length, corrections: navProvenance.filter((v) => v.correctionOf !== null).length, allWithSubmitterAndPayload: navProvenance.every((v) => v.by && /^0x[0-9a-f]{64}$/.test(v.payloadHash) && !/^0x0+$/.test(v.payloadHash)), detail: navProvenance },
      Q6: { matched: pcrMatched, checkpoints: accepted.length },
      Q7: { delayed: delays },
    };
    const expected = {
      Q1: answers.Q1.compliant === 4 && answers.Q1.total === 5 && answers.Q1.exceptions.length === 1 && answers.Q1.exceptions[0].investor === 'C' && answers.Q1.exceptions[0].type === 'subscription',
      Q2: q2.length === 1 && q2[0].investor === 'A' && q2[0].event === 'RedemptionSettled',
      Q3: answers.Q3.eligibleAtTime === answers.Q3.movements,
      Q4: suspension.shareMovements === 0 && suspension.redemptionRequests === 1 && suspension.navVersions === 2,
      Q5: answers.Q5.versions === 5 && answers.Q5.corrections === 1 && answers.Q5.allWithSubmitterAndPayload,
      Q6: pcrMatched === accepted.length,
      Q7: delays.length === 1 && delays[0].investor === 'B' && typeof delays[0].settlementLagSec === 'number',
    };
    const summary = {
      experiment: 'paper85-v3-part-C-case',
      provenance: { ...gitHead(), planSha256: await sha256File(resolve(EVAL_DIR, 'spec-v3/evaluation-plan.v3.md')), tools: toolVersions(), D0, runAt: new Date().toISOString() },
      steps: log,
      stepsMatchingPreregistration: log.filter((e) => e.match).length,
      acceptedOperations: accepted.length,
      rejectedAttempts: log.filter((e) => e.observed !== 'accepted').map((e) => ({ id: e.id, reason: e.observed })),
      lifecycleEvents: events.length,
      arc: { replayed: events.length, accepted: events.length },
      nri: { valid: finalizedRefs.filter((r) => r.valid).length, total: finalizedRefs.length },
      answers,
      preregisteredAnswersMatch: expected,
      finalProjectionSha256: sha256(JSON.stringify(normalizedProjection(state))),
    };
    const hash = await writeJson(resolve(RESULTS_DIR, 'C-case-summary.json'), summary);
    console.log(JSON.stringify({ hash, steps: `${summary.stepsMatchingPreregistration}/${log.length}`, accepted: accepted.length, events: events.length, nri: summary.nri, pcr: answers.Q6, expected, q1: answers.Q1.exceptions, q2, q4: suspension, q7: delays }, null, 1));
  } finally {
    await env.stop();
  }
}

await main();
