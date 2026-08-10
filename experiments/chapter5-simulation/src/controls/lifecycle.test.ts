import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { parseSimulationConfig, type SimulationConfig } from '../core/config';
import { TICK_SEC } from '../core/pipeline';
import { liquidAssetValue } from '../liquidity/buffer';
import { generateNetworkModel } from '../network/generator';
import { submitOracleRisk } from '../oracle/submission';
import { queueRedemptionRequestsForFund, settlePendingRedemptions } from '../redemption/lifecycle';
import type { InvestorRedemptionIntent } from '../redemption/types';
import { createInitialSimulationState } from '../state/initialization';
import type { SimulationState } from '../state/types';
import { applyGateControlForSubmission } from './lifecycle';

const baselineInput = JSON.parse(readFileSync(
  new URL('../../config/pilot-baseline.json', import.meta.url),
  'utf8',
)) as Record<string, Record<string, unknown>>;
const baseline = parseSimulationConfig(baselineInput);
const network = generateNetworkModel(baseline);
const fundId = 'fund-001';
const BASE_AT = baseline.shock.cycleStartAt;

function controlConfig(overrides: {
  kappaBps?: number;
  phiBps?: number;
  releaseConsecutiveTicks?: number;
  releaseDelayTicks?: number;
  zeroPriceImpact?: boolean;
} = {}): SimulationConfig {
  const input = structuredClone(baselineInput);
  if (overrides.kappaBps !== undefined) {
    input.thresholds.baselineKappaBps = overrides.kappaBps;
    input.thresholds.kappaScanBps = [overrides.kappaBps];
  }
  if (overrides.phiBps !== undefined) input.control.baselinePhiBps = overrides.phiBps;
  if (overrides.releaseConsecutiveTicks !== undefined) {
    input.control.releaseConsecutiveTicks = overrides.releaseConsecutiveTicks;
    input.control.releaseConsecutiveTicksScan = [overrides.releaseConsecutiveTicks];
  }
  if (overrides.releaseDelayTicks !== undefined) {
    input.control.releaseDelayTicks = overrides.releaseDelayTicks;
    input.control.releaseDelayTicksScan = [overrides.releaseDelayTicks];
  }
  if (overrides.zeroPriceImpact) input.liquidity.priceImpactLambdaBps = 0;
  return parseSimulationConfig(input);
}

function submitAt(
  state: SimulationState,
  config: SimulationConfig,
  tick: number,
  requestedSharesInWindow = 0,
): SimulationState {
  const result = submitOracleRisk(state, network, config, {
    replicateId: 0,
    tick,
    fundId,
    occurredAt: BASE_AT + tick * TICK_SEC,
    requestedSharesInWindow,
  });
  assert.equal(result.status, 'submitted');
  return result.state;
}

function applyLatest(state: SimulationState, config: SimulationConfig) {
  return applyGateControlForSubmission(
    state,
    network,
    config,
    state.oracleRiskSnapshots.at(-1)!.submissionId,
  );
}

function allRedeemIntents(state: SimulationState): InvestorRedemptionIntent[] {
  return state.holderBalances
    .filter((holding) => holding.fundId === fundId && holding.shares > 0)
    .map((holding) => ({
      replicateId: 0,
      investorId: holding.investorId,
      fundId,
      tick: 0,
      redeem: true,
    }));
}

test('triggers once from a successful above-kappa Oracle snapshot', () => {
  const config = controlConfig({ kappaBps: 0, phiBps: 7_500 });
  const submitted = submitAt(createInitialSimulationState(network, BASE_AT), config, 0);
  const triggered = applyLatest(submitted, config);
  const fund = triggered.state.funds.find(({ fundId: id }) => id === fundId)!;

  assert.equal(triggered.status, 'triggered');
  assert.equal(fund.gated, true);
  assert.equal(fund.gatePhiBps, 7_500);
  assert.equal(fund.gatedAt, BASE_AT);
  assert.equal(triggered.state.controlTransitions.length, 1);
  assert.equal(triggered.transition?.kind, 'GateTriggered');
  const corrupted = structuredClone(triggered.state);
  corrupted.controlTransitions[0]!.riskScoreBps += 1;
  assert.throws(
    () => applyGateControlForSubmission(
      corrupted,
      network,
      config,
      corrupted.controlTransitions[0]!.sourceSubmissionId,
    ),
    /GATE_TRANSITION_SOURCE_MISMATCH/,
  );
  assert.throws(
    () => applyGateControlForSubmission(
      triggered.state,
      network,
      config,
      triggered.transition!.sourceSubmissionId,
    ),
    /CONTROL_SUBMISSION_ALREADY_PROCESSED/,
  );

  const repeated = applyLatest(submitAt(triggered.state, config, 1), config);
  assert.equal(repeated.status, 'unchanged');
  assert.equal(repeated.state.controlTransitions.length, 1);
});

test('releases only after consecutive low-score ticks and the regulatory delay', () => {
  const triggerConfig = controlConfig({ kappaBps: 0 });
  const lowConfig = controlConfig({
    kappaBps: 10_000,
    releaseConsecutiveTicks: 3,
    releaseDelayTicks: 1,
  });
  let state = applyLatest(
    submitAt(createInitialSimulationState(network, BASE_AT), triggerConfig, 0),
    triggerConfig,
  ).state;

  const statuses: string[] = [];
  for (let tick = 1; tick <= 4; tick += 1) {
    const result = applyLatest(submitAt(state, lowConfig, tick), lowConfig);
    statuses.push(result.status);
    state = result.state;
  }

  assert.deepEqual(statuses, ['unchanged', 'unchanged', 'unchanged', 'released']);
  const fund = state.funds.find(({ fundId: id }) => id === fundId)!;
  assert.equal(fund.gated, false);
  assert.equal(fund.gatePhiBps, 0);
  assert.equal(fund.gateReleaseStreakTicks, 0);
  assert.equal(fund.gateReleaseEligibleAtTick, null);
  assert.deepEqual(state.controlTransitions.map(({ kind }) => kind), [
    'GateTriggered',
    'GateReleased',
  ]);
});

test('a missing successful tick breaks the low-score release streak', () => {
  const triggerConfig = controlConfig({ kappaBps: 0 });
  const lowConfig = controlConfig({
    kappaBps: 10_000,
    releaseConsecutiveTicks: 2,
    releaseDelayTicks: 0,
  });
  let state = applyLatest(
    submitAt(createInitialSimulationState(network, BASE_AT), triggerConfig, 0),
    triggerConfig,
  ).state;
  state = applyLatest(submitAt(state, lowConfig, 2), lowConfig).state;
  assert.equal(
    state.funds.find(({ fundId: id }) => id === fundId)!.gateReleaseStreakTicks,
    1,
  );
  const released = applyLatest(submitAt(state, lowConfig, 3), lowConfig);
  assert.equal(released.status, 'released');
});

test('rejects a second Oracle snapshot while the prior control evaluation is pending', () => {
  const config = controlConfig({ kappaBps: 0 });
  const first = submitAt(createInitialSimulationState(network, BASE_AT), config, 0);
  assert.throws(
    () => submitAt(first, config, 1),
    /MULTIPLE_UNPROCESSED_CONTROL_SUBMISSIONS/,
  );
});

test('full Gate blocks new requests while preserving latent demand in the queue summary', () => {
  const config = controlConfig({ kappaBps: 0, phiBps: 10_000 });
  const initial = createInitialSimulationState(network, BASE_AT);
  const gated = applyLatest(submitAt(initial, config, 0), config).state;
  const queued = queueRedemptionRequestsForFund(
    gated,
    network,
    fundId,
    allRedeemIntents(gated),
    10_000,
    config.control.seed,
  );

  assert.equal(queued.summary.redeemingInvestorCount, 20);
  assert.equal(queued.summary.blockedByGateInvestorCount, 20);
  assert.equal(queued.summary.requestedShares, 0);
  assert.equal(queued.summary.blockedSharesByGate, 100_000_000);
  assert.equal(queued.summary.latentRequestedShares, 100_000_000);
  assert.equal(queued.state.redemptionRequests.length, 0);
  assert.equal(queued.state.funds.find(({ fundId: id }) => id === fundId)!.queuedRedemptionShares, 0);
});

test('higher phi cannot increase controlled-fund settlement or liquid-asset consumption', () => {
  const initial = createInitialSimulationState(network, BASE_AT);
  const queued = queueRedemptionRequestsForFund(
    initial,
    network,
    fundId,
    allRedeemIntents(initial),
    10_000,
    baseline.control.seed,
  ).state;
  const triggerConfig = controlConfig({ kappaBps: 0, zeroPriceImpact: true });
  const submitted = submitAt(
    queued,
    triggerConfig,
    0,
    queued.funds.find(({ fundId: id }) => id === fundId)!.queuedRedemptionShares,
  );
  const rows = [0, 2_500, 5_000, 7_500, 10_000].map((phiBps) => {
    const config = controlConfig({ kappaBps: 0, phiBps, zeroPriceImpact: true });
    const gated = applyLatest(submitted, config).state;
    const settled = settlePendingRedemptions(gated, network, config).state;
    const fund = settled.funds.find(({ fundId: id }) => id === fundId)!;
    return {
      phiBps,
      settledAmount: fund.cumulativeSettlementAmount,
      remainingLiquidAssets: liquidAssetValue(settled, network, fundId),
    };
  });

  rows.forEach((row, index) => {
    if (index === 0) return;
    assert.ok(row.settledAmount <= rows[index - 1]!.settledAmount);
    assert.ok(row.remainingLiquidAssets >= rows[index - 1]!.remainingLiquidAssets);
  });
  assert.ok(rows[0]!.settledAmount > 0);
  assert.equal(rows.at(-1)!.settledAmount, 0);
  assert.ok(new Set(rows.map(({ settledAmount }) => settledAmount)).size >= 3);
});
