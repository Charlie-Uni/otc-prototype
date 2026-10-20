// Pure reconstruction of Q1–Q7. Views are used only for Q6 comparisons.
import assert from 'node:assert/strict';
import { isDeepStrictEqual } from 'node:util';
import { auditPricing, navCorrections } from './audit-pricing.mjs';
import { applyReplayEvent, createReplayState, finalizeNavReferences, normalizedProjection } from '../replay-engine.mjs';

const ZERO = `0x${'0'.repeat(40)}`;
const UNIT = 10n ** 18n;
export const actorNames = (spec) => Object.fromEntries(
  Object.entries(spec.actors).map(([name, address]) => [address.toLowerCase(), name]));

export function auditCase({ genesis, events, checkpoints, pricingPolicy, names }) {
  const state = createReplayState(genesis);
  const name = (address) => names[address.toLowerCase()] ?? address.toLowerCase();
  const refs = []; const movements = []; const provenance = []; const delays = [];
  const projections = new Map();
  const suspension = { shareMovements: 0, redemptionRequests: 0, subscriptionRequests: 0, navVersions: 0 };
  let suspended = false;
  for (const event of events) {
    const { eventName, args } = event;
    if (eventName === 'Transfer') {
      const from = args.from.toLowerCase(); const to = args.to.toLowerCase();
      const kind = from === ZERO ? 'mint' : to === ZERO ? 'burn' : 'transfer';
      const parties = kind === 'mint' ? [to] : kind === 'burn' ? [from] : [from, to];
      movements.push({ kind, parties: parties.map(name), eligible: parties.every((p) => Boolean(state.whitelist[p])) });
      if (suspended) suspension.shareMovements++;
    }
    if (suspended && eventName === 'RedemptionRequested') suspension.redemptionRequests++;
    if (suspended && eventName === 'SubscriptionRequested') suspension.subscriptionRequests++;
    if (suspended && eventName === 'NAVUpdatedEvent') suspension.navVersions++;
    if (eventName === 'Paused') suspended = true;
    if (eventName === 'Unpaused') suspended = false;
    if (eventName === 'NAVUpdatedEvent') {
      provenance.push({ index: state.navHistory.length, nav: String(args.nav), asOf: String(args.asOf),
        by: name(args.by), payloadHash: args.payloadHash });
    }
    if (eventName === 'SettlementDelayed') {
      delays.push({ requestId: String(args.requestId), investor: name(args.investor), reasonHash: args.reasonHash,
        requestedAt: Number(args.requestedAt), delayedAt: Number(args.delayedAt) });
    }
    if (eventName === 'RedemptionSettled') {
      for (const delay of delays.filter((d) => d.requestId === String(args.requestId))) {
        delay.settlementLagSec = Number(args.settledAt) - delay.requestedAt;
      }
    }
    refs.push(...applyReplayEvent(state, event));
    projections.set(String(event.blockNumber), normalizedProjection(state));
  }
  const references = finalizeNavReferences(state, refs);
  const corrections = navCorrections(state.navHistory);
  provenance.forEach((nav) => { nav.correctionOf = corrections.correctionOf[nav.index]; });
  const pricing = auditPricing(state, references, pricingPolicy).map((r) => ({ ...r, investor: name(r.investor) }));
  const affected = references.filter((ref) => corrections.latestVersion[ref.latestRecoverableNavIndex] !== ref.latestRecoverableNavIndex)
    .map((ref) => {
      const redemption = ref.eventName === 'RedemptionSettled';
      const request = (redemption ? state.redemptions : state.subscriptions)[Number(ref.requestId)];
      const result = { event: ref.eventName, requestId: String(ref.requestId), navIndex: ref.latestRecoverableNavIndex,
        nav: ref.referencedNav, investor: name(request.investor) };
      if (redemption) {
        const corrected = state.navHistory[corrections.latestVersion[result.navIndex]];
        result.paidAmount = request.redemptionAmount;
        result.amountAtCorrectedNav = (BigInt(request.redeemedShares) * BigInt(corrected.nav) / UNIT).toString();
        result.overpayment = (BigInt(result.paidAmount) - BigInt(result.amountAtCorrectedNav)).toString();
      }
      return result;
    });
  const checkpointMatches = checkpoints.map((cp) => isDeepStrictEqual(projections.get(String(cp.block)), cp.view));
  const answers = {
    Q1: { matchingCasePolicy: pricing.filter((r) => r.nextApplicableNavMatches).length, total: pricing.length,
      exceptions: pricing.filter((r) => !r.nextApplicableNavMatches),
      originalProxyMatching: pricing.filter((r) => r.originalAsOfProxy).length, detail: pricing },
    Q2: { affected },
    Q3: { movements: movements.length, eligibleAtTime: movements.filter((r) => r.eligible).length, detail: movements },
    Q4: suspension,
    Q5: { versions: provenance.length, corrections: corrections.correctionIndices.length,
      allWithSubmitterAndPayload: provenance.every((r) => r.by && /^0x[0-9a-f]{64}$/.test(r.payloadHash) && !/^0x0+$/.test(r.payloadHash)),
      detail: provenance },
    Q6: { matched: checkpointMatches.filter(Boolean).length, checkpoints: checkpoints.length },
    Q7: { delayed: delays },
  };
  return { answers, state, references, corrections, checkpointMatches };
}

// Explicit selectors keep the post-review expectation file readable. Complete
// arrays (not just counts) bind the affected set, movements and delay records.
export function assertCaseExpectations(answers, spec) {
  const checked = new Set();
  for (const [selector, expected] of Object.entries(spec.expected)) {
    const observed = selector.split('.').reduce((value, key) => value?.[key], answers);
    assert.deepEqual(observed, expected, `Case expectation ${selector}`);
    checked.add(selector.split('.')[0]);
  }
  assert.deepEqual([...checked].sort(), ['Q1', 'Q2', 'Q3', 'Q4', 'Q5', 'Q6', 'Q7'], 'Expected coverage Q1–Q7');
  return Object.fromEntries([...checked].map((question) => [question, true]));
}

export function assertCaseAnswers(recomputed, archived) {
  for (const question of ['Q1', 'Q2', 'Q3', 'Q4', 'Q5', 'Q6', 'Q7']) {
    assert.deepEqual(recomputed[question], archived[question], `Archived case answer ${question}`);
  }
}
