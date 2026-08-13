import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { parseSimulationConfig, type SimulationConfig } from '../core/config';
import { TICK_SEC } from '../core/pipeline';
import { applyGateControlForSubmission } from '../controls/lifecycle';
import { generateNetworkModel } from '../network/generator';
import { submitOracleRisk } from '../oracle/submission';
import { createInitialSimulationState } from '../state/initialization';
import type { SimulationState } from '../state/types';
import { validateSimulationState } from '../state/validation';
import {
  queueRedemptionRequestsForFund,
  queueRedemptionRequestsForFunds,
  settlePendingRedemptions,
} from './lifecycle';
import type { InvestorRedemptionIntent } from './types';

const baselineInput = JSON.parse(readFileSync(
  new URL('../../config/pilot-baseline.json', import.meta.url),
  'utf8',
)) as unknown;
const config = parseSimulationConfig(baselineInput);
const network = generateNetworkModel(config);

function initialState(): SimulationState {
  return createInitialSimulationState(network, config.shock.cycleStartAt);
}

function intentsFor(
  state: SimulationState,
  fundId: string,
  redeemingInvestorIds: ReadonlySet<string>,
  tick = 0,
): InvestorRedemptionIntent[] {
  return state.holderBalances
    .filter((holding) => holding.fundId === fundId && holding.shares > 0)
    .map((holding) => ({
      replicateId: 0,
      investorId: holding.investorId,
      fundId,
      tick,
      redeem: redeemingInvestorIds.has(holding.investorId),
    }));
}

function largestHolder(state: SimulationState, fundId: string): string {
  return state.holderBalances
    .filter((holding) => holding.fundId === fundId)
    .sort((left, right) => right.shares - left.shares)[0]!.investorId;
}

function partialGateConfig(phiBps: number): SimulationConfig {
  const input = structuredClone(baselineInput) as Record<string, Record<string, unknown>>;
  input.thresholds.baselineKappaBps = 0;
  input.thresholds.kappaScanBps = [0];
  input.control.baselinePhiBps = phiBps;
  input.control.phiScanBps = [phiBps];
  input.liquidity.priceImpactLambdaBps = 0;
  return parseSimulationConfig(input);
}

function gateFund(
  state: SimulationState,
  fundId: string,
  controlConfig: SimulationConfig,
): SimulationState {
  const submitted = submitOracleRisk(state, network, controlConfig, {
    replicateId: 0,
    tick: 0,
    fundId,
    occurredAt: state.nowSec,
    requestedSharesInWindow: 0,
  });
  assert.equal(submitted.status, 'submitted');
  return applyGateControlForSubmission(
    submitted.state,
    network,
    controlConfig,
    submitted.state.oracleRiskSnapshots.at(-1)!.submissionId,
  ).state;
}

test('queues full available holdings while reporting both pressure definitions', () => {
  const state = initialState();
  const fundId = 'fund-001';
  const holders = state.holderBalances.filter((holding) => holding.fundId === fundId);
  const redeeming = new Set(holders.slice(0, 2).map(({ investorId }) => investorId));
  const result = queueRedemptionRequestsForFund(
    state,
    network,
    fundId,
    intentsFor(state, fundId, redeeming),
    config.liquidity.redemptionRequestFractionBps,
  );

  assert.equal(result.summary.eligibleInvestorCount, 20);
  assert.equal(result.summary.redeemingInvestorCount, 2);
  assert.equal(result.summary.blockedByGateInvestorCount, 0);
  assert.equal(result.summary.decisionPressureBps, 1_000);
  assert.equal(result.summary.requestedShares, 10_000_000);
  assert.equal(result.summary.blockedSharesByGate, 0);
  assert.equal(result.summary.latentRequestedShares, 10_000_000);
  assert.equal(result.summary.requestPressureBps, 1_000);
  assert.equal(result.state.redemptionRequests.length, 2);
  assert.equal(result.state.funds[0]!.queuedRedemptionShares, 10_000_000);
  assert.equal(state.redemptionRequests.length, 0);
  assert.equal(state.funds[0]!.queuedRedemptionShares, 0);
});

test('locks pending shares so later ticks can request only the remaining balance', () => {
  const state = initialState();
  const fundId = 'fund-001';
  const investorId = largestHolder(state, fundId);
  const initialShares = state.holderBalances.find((holding) => (
    holding.fundId === fundId && holding.investorId === investorId
  ))!.shares;
  const first = queueRedemptionRequestsForFund(
    state,
    network,
    fundId,
    intentsFor(state, fundId, new Set([investorId]), 0),
    5_000,
  ).state;
  first.nowSec += TICK_SEC;
  const second = queueRedemptionRequestsForFund(
    first,
    network,
    fundId,
    intentsFor(first, fundId, new Set([investorId]), 1),
    5_000,
  ).state;
  const requests = second.redemptionRequests.filter((request) => request.investorId === investorId);

  assert.deepEqual(requests.map(({ requestedShares }) => requestedShares), [
    Math.floor(initialShares / 2),
    Math.floor(initialShares / 4),
  ]);
  assert.equal(
    second.funds.find(({ fundId: id }) => id === fundId)!.queuedRedemptionShares,
    Math.floor(initialShares * 3 / 4),
  );
  validateSimulationState(second, network);
});

test('settles FIFO requests from liquid assets and preserves share/AUM accounting', () => {
  const state = initialState();
  const fundId = 'fund-001';
  const holders = state.holderBalances.filter((holding) => holding.fundId === fundId);
  const queued = queueRedemptionRequestsForFund(
    state,
    network,
    fundId,
    intentsFor(state, fundId, new Set(holders.slice(0, 2).map(({ investorId }) => investorId))),
    10_000,
  ).state;
  const result = settlePendingRedemptions(queued, network, config);
  const fund = result.state.funds.find(({ fundId: id }) => id === fundId)!;

  assert.deepEqual(result.summary, {
    attemptedRequestCount: 2,
    settledRequestCount: 2,
    settledShares: 10_000_000,
    settlementAmount: 10_000_000,
    fireSaleDiscountLoss: 0,
    pendingRequestCount: 0,
    pendingByReason: {},
  });
  assert.equal(fund.totalShares, 90_000_000);
  assert.equal(fund.economicAum, 90_000_000);
  assert.equal(fund.reportedAum, 90_000_000);
  assert.equal(fund.queuedRedemptionShares, 0);
  assert.equal(fund.reportedNavPerShareBps, 10_000);
  assert.equal(result.state.assetSales.length, 0);
  assert.ok(result.state.redemptionRequests.every(({ status }) => status === 'settled'));
  validateSimulationState(result.state, network);
});

test('sells illiquid assets only after cash and records discount loss', () => {
  const state = initialState();
  const fundId = 'fund-003';
  const investorId = largestHolder(state, fundId);
  const queued = queueRedemptionRequestsForFund(
    state,
    network,
    fundId,
    intentsFor(state, fundId, new Set([investorId])),
    10_000,
  ).state;
  const result = settlePendingRedemptions(queued, network, config);
  const request = result.state.redemptionRequests[0]!;
  const fund = result.state.funds.find(({ fundId: id }) => id === fundId)!;

  assert.equal(result.summary.settledRequestCount, 1);
  assert.equal(request.status, 'settled');
  assert.equal(request.settlementNavPerShareBps, 10_000);
  assert.ok(result.state.assetSales.length >= 1);
  assert.ok(result.summary.fireSaleDiscountLoss > 0);
  assert.equal(fund.economicAum, 100_000_000
    - result.summary.settlementAmount
    - result.summary.fireSaleDiscountLoss);
  assert.equal(fund.reportedAum, 100_000_000 - result.summary.settlementAmount);
  assert.equal(
    result.state.assetSales.reduce((sum, sale) => sum + sale.grossAmount - sale.proceeds, 0),
    result.summary.fireSaleDiscountLoss,
  );
  validateSimulationState(result.state, network);
});

test('keeps a whole request pending without partial asset mutation when liquidity is insufficient', () => {
  const state = initialState();
  const fundId = 'fund-003';
  for (const position of state.assetPositions) {
    if (position.fundId === fundId && position.assetClassId !== 'asset-001') position.value = 0;
  }
  const fund = state.funds.find(({ fundId: id }) => id === fundId)!;
  fund.economicAum = state.assetPositions
    .filter((position) => position.fundId === fundId)
    .reduce((sum, position) => sum + position.value, 0);
  validateSimulationState(state, network);

  const queued = queueRedemptionRequestsForFund(
    state,
    network,
    fundId,
    intentsFor(state, fundId, new Set([largestHolder(state, fundId)])),
    10_000,
  ).state;
  const positionsBefore = structuredClone(queued.assetPositions);
  const result = settlePendingRedemptions(queued, network, config);

  assert.equal(result.summary.settledRequestCount, 0);
  assert.equal(result.summary.pendingByReason.insufficient_liquidity, 1);
  assert.deepEqual(result.state.assetPositions, positionsBefore);
  assert.equal(result.state.assetSales.length, 0);
  assert.equal(result.state.redemptionRequests[0]!.status, 'pending');
});

test('applies settlement delay and gate checks before touching liquidity', () => {
  const delayedInput = structuredClone(baselineInput) as Record<string, Record<string, unknown>>;
  delayedInput.liquidity.baselineSettlementDelayDays = 1;
  const delayedConfig = parseSimulationConfig(delayedInput) as SimulationConfig;
  const state = initialState();
  const fundId = 'fund-001';
  const investorId = largestHolder(state, fundId);
  const queued = queueRedemptionRequestsForFund(
    state,
    network,
    fundId,
    intentsFor(state, fundId, new Set([investorId])),
    10_000,
  ).state;
  const delayed = settlePendingRedemptions(queued, network, delayedConfig);
  assert.equal(delayed.summary.pendingByReason.settlement_delay, 1);

  const gatedInput = structuredClone(baselineInput) as Record<string, Record<string, unknown>>;
  gatedInput.thresholds.baselineKappaBps = 0;
  gatedInput.thresholds.kappaScanBps = [0];
  const gatedConfig = parseSimulationConfig(gatedInput);
  const submitted = submitOracleRisk(queued, network, gatedConfig, {
    replicateId: 0,
    tick: 0,
    fundId,
    occurredAt: queued.nowSec,
    requestedSharesInWindow: queued.funds.find(({ fundId: id }) => id === fundId)!
      .queuedRedemptionShares,
  });
  assert.equal(submitted.status, 'submitted');
  const gatedState = applyGateControlForSubmission(
    submitted.state,
    network,
    gatedConfig,
    submitted.state.oracleRiskSnapshots.at(-1)!.submissionId,
  ).state;
  const gated = settlePendingRedemptions(gatedState, network, gatedConfig);
  assert.equal(gated.summary.pendingByReason.gated, 1);
  assert.deepEqual(gated.state.assetPositions, queued.assetPositions);
});

test('carries unused partial-Gate budget without accruing twice in one tick', () => {
  const controlConfig = partialGateConfig(5_000);
  const fundId = 'fund-001';
  const gated = gateFund(initialState(), fundId, controlConfig);
  const investorId = largestHolder(gated, fundId);
  const queued = queueRedemptionRequestsForFund(
    gated,
    network,
    fundId,
    intentsFor(gated, fundId, new Set([investorId])),
    10_000,
  ).state;
  const requestedAmount = queued.redemptionRequests[0]!.requestedShares;

  const firstAttempt = settlePendingRedemptions(queued, network, controlConfig);
  const firstFund = firstAttempt.state.funds.find(({ fundId: id }) => id === fundId)!;
  assert.equal(firstAttempt.summary.settledRequestCount, 0);
  assert.equal(firstAttempt.summary.pendingByReason.gated, 1);
  assert.equal(firstFund.gateSettlementBudgetCarry, Math.floor(requestedAmount / 2));

  const sameTickAttempt = settlePendingRedemptions(firstAttempt.state, network, controlConfig);
  assert.equal(sameTickAttempt.summary.settledRequestCount, 0);
  assert.equal(
    sameTickAttempt.state.funds.find(({ fundId: id }) => id === fundId)!
      .gateSettlementBudgetCarry,
    Math.floor(requestedAmount / 2),
  );

  const nextTickState = structuredClone(sameTickAttempt.state);
  nextTickState.nowSec += TICK_SEC;
  const nextTickAttempt = settlePendingRedemptions(nextTickState, network, controlConfig);
  const finalFund = nextTickAttempt.state.funds.find(({ fundId: id }) => id === fundId)!;
  assert.equal(nextTickAttempt.summary.settledRequestCount, 1);
  assert.equal(nextTickAttempt.summary.settlementAmount, requestedAmount);
  assert.equal(finalFund.gateSettlementBudgetCarry, 0);
  assert.equal(nextTickAttempt.state.redemptionRequests[0]!.status, 'settled');
});

test('keeps requests pending when integer settlement rounds to zero', () => {
  const state = initialState();
  const fundId = 'fund-001';
  const fund = state.funds.find(({ fundId: id }) => id === fundId)!;
  fund.reportedAum = 1;
  fund.reportedNavPerShareBps = 0;
  validateSimulationState(state, network);

  const queued = queueRedemptionRequestsForFund(
    state,
    network,
    fundId,
    intentsFor(state, fundId, new Set([largestHolder(state, fundId)])),
    10_000,
  ).state;
  const result = settlePendingRedemptions(queued, network, config);

  assert.equal(result.summary.settledRequestCount, 0);
  assert.equal(result.summary.pendingByReason.settlement_amount_rounds_to_zero, 1);
  assert.equal(result.state.redemptionRequests[0]!.settlementAmount, null);
});

test('keeps final fund-closure redemption pending instead of inventing liquidation rules', () => {
  const state = initialState();
  const fundId = 'fund-001';
  const holdings = state.holderBalances.filter((holding) => holding.fundId === fundId);
  const finalInvestorId = holdings[0]!.investorId;
  for (const holding of holdings) holding.shares = 0;
  holdings[0]!.shares = state.funds.find(({ fundId: id }) => id === fundId)!.totalShares;
  validateSimulationState(state, network);

  const queued = queueRedemptionRequestsForFund(
    state,
    network,
    fundId,
    intentsFor(state, fundId, new Set([finalInvestorId])),
    10_000,
  ).state;
  const result = settlePendingRedemptions(queued, network, config);

  assert.equal(result.summary.settledRequestCount, 0);
  assert.equal(result.summary.pendingByReason.fund_closure_out_of_scope, 1);
  assert.equal(result.state.funds.find(({ fundId: id }) => id === fundId)!.totalShares, 100_000_000);
});

test('rejects incomplete intent sets and detects queue-accounting tampering', () => {
  const state = initialState();
  const fundId = 'fund-001';
  assert.throws(
    () => queueRedemptionRequestsForFund(
      state,
      network,
      fundId,
      [],
      10_000,
    ),
    /INCOMPLETE_REDEMPTION_INTENT_SET/,
  );
  const mismatchedTicks = intentsFor(
    state,
    fundId,
    new Set([largestHolder(state, fundId)]),
  );
  mismatchedTicks[0]!.tick = 1;
  assert.throws(
    () => queueRedemptionRequestsForFund(
      state,
      network,
      fundId,
      mismatchedTicks,
      10_000,
    ),
    /REDEMPTION_INTENT_TICK_MISMATCH/,
  );

  const queued = queueRedemptionRequestsForFund(
    state,
    network,
    fundId,
    intentsFor(state, fundId, new Set([largestHolder(state, fundId)])),
    10_000,
  ).state;
  queued.funds.find(({ fundId: id }) => id === fundId)!.queuedRedemptionShares += 1;
  assert.throws(
    () => validateSimulationState(queued, network),
    /QUEUED_REDEMPTION_SHARES_MISMATCH/,
  );

  const invalidReason = queueRedemptionRequestsForFund(
    state,
    network,
    fundId,
    intentsFor(state, fundId, new Set([largestHolder(state, fundId)])),
    10_000,
  ).state;
  invalidReason.redemptionRequests[0]!.pendingReason = 'invalid_reason' as never;
  assert.throws(
    () => validateSimulationState(invalidReason, network),
    /INVALID_PENDING_REDEMPTION_STATE/,
  );
});

test('batch queueing is state-equivalent to validated sequential fund queueing', () => {
  const state = initialState();
  const fundIds = ['fund-001', 'fund-002'];
  const inputs = fundIds.map((fundId) => ({
    fundId,
    intents: intentsFor(state, fundId, new Set([largestHolder(state, fundId)])),
  }));
  let sequentialState = state;
  const sequentialSummaries = inputs.map((input) => {
    const result = queueRedemptionRequestsForFund(
      sequentialState,
      network,
      input.fundId,
      input.intents,
      2_500,
    );
    sequentialState = result.state;
    return result.summary;
  });
  const batch = queueRedemptionRequestsForFunds(
    state,
    network,
    inputs,
    2_500,
  );
  assert.deepEqual(batch.state, sequentialState);
  assert.deepEqual(batch.summaries, sequentialSummaries);
  assert.throws(() => queueRedemptionRequestsForFunds(
    state,
    network,
    [inputs[0]!, inputs[0]!],
    2_500,
  ), /DUPLICATE_REDEMPTION_QUEUE_FUND/);
});
