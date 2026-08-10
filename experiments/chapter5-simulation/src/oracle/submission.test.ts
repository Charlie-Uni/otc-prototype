import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { parseSimulationConfig } from '../core/config';
import { TICK_SEC } from '../core/pipeline';
import { generateNetworkModel } from '../network/generator';
import { createInitialSimulationState } from '../state/initialization';
import { validateSimulationState } from '../state/validation';
import type { OracleSubmissionRequest } from './types';
import { baselineOracleTreatment, submitOracleRisk } from './submission';

const config = parseSimulationConfig(JSON.parse(readFileSync(
  new URL('../../config/pilot-baseline.json', import.meta.url),
  'utf8',
)) as unknown);
const network = generateNetworkModel(config);
const BASE_AT = config.shock.cycleStartAt;
const lowCadenceFund = network.funds.find(({ stalePricingTier }) => stalePricingTier === 'low')!;

function request(overrides: Partial<OracleSubmissionRequest> = {}): OracleSubmissionRequest {
  return {
    replicateId: 0,
    tick: 1,
    fundId: lowCadenceFund.id,
    occurredAt: BASE_AT + TICK_SEC,
    requestedSharesInWindow: 0,
    ...overrides,
  };
}

test('submits the baseline Oracle snapshot on the first deterministic attempt', () => {
  const state = createInitialSimulationState(network, BASE_AT);
  const result = submitOracleRisk(state, network, config, request());

  assert.equal(result.status, 'submitted');
  assert.equal(result.attempts.length, 1);
  assert.equal(result.attempts[0]!.failed, false);
  assert.equal(result.state.nowSec, BASE_AT + TICK_SEC);
  assert.equal(result.state.oracleRiskSnapshots.length, 1);
  const snapshot = result.state.oracleRiskSnapshots[0]!;
  assert.equal(snapshot.submittedAt, request().occurredAt);
  assert.equal(snapshot.navUpdated, true);
  assert.equal(snapshot.attemptCount, 1);
  assert.equal(snapshot.failedAttemptCount, 0);
  assert.equal(snapshot.maxStaleAgeDays, 30);
  assert.equal(snapshot.liquidityBufferRatioBps, lowCadenceFund.liquidityBufferRatioBps);
  assert.equal(snapshot.riskScoreBps, result.candidate.riskScoreBps);
  assert.equal(snapshot.detected, snapshot.riskScoreBps >= snapshot.detectionThresholdBps);
  assert.equal(snapshot.interventionTriggered, snapshot.riskScoreBps > snapshot.kappaBps);

  const corrupted = structuredClone(result.state);
  corrupted.oracleRiskSnapshots[0]!.staleAgeSecRaw = TICK_SEC;
  assert.throws(
    () => validateSimulationState(corrupted, network),
    /ORACLE_NAV_UPDATE_WITH_STALE_AGE/,
  );
});

test('rejects a snapshot whose raw stale provenance cannot reproduce its normalized metric', () => {
  const highCadenceFund = network.funds.find(({ stalePricingTier }) => stalePricingTier === 'high')!;
  const state = createInitialSimulationState(network, BASE_AT);
  const result = submitOracleRisk(state, network, config, request({
    fundId: highCadenceFund.id,
  }));
  assert.equal(result.status, 'submitted');
  assert.equal(result.state.oracleRiskSnapshots[0]!.navUpdated, false);

  const corrupted = structuredClone(result.state);
  corrupted.oracleRiskSnapshots[0]!.maxStaleAgeDays = 45;
  assert.throws(
    () => validateSimulationState(corrupted, network),
    /ORACLE_STALE_RISK_MISMATCH/,
  );
});

test('records latency separately while the NAV snapshot remains anchored to occurredAt', () => {
  const state = createInitialSimulationState(network, BASE_AT);
  const latencySec = 3_600;
  const result = submitOracleRisk(state, network, config, request(), {
    ...baselineOracleTreatment(config),
    latencySec,
  });
  assert.equal(result.status, 'submitted');
  const snapshot = result.state.oracleRiskSnapshots[0]!;
  const fund = result.state.funds.find(({ fundId }) => fundId === lowCadenceFund.id)!;
  assert.equal(snapshot.occurredAt, BASE_AT + TICK_SEC);
  assert.equal(snapshot.submittedAt, BASE_AT + TICK_SEC + latencySec);
  assert.equal(fund.lastValuationAsOf, snapshot.occurredAt);
  assert.equal(fund.lastValuationUpdateAt, snapshot.submittedAt);
  assert.equal(snapshot.staleAgeSecRaw, 0);
});

test('keeps state unchanged when every transaction attempt fails', () => {
  const state = createInitialSimulationState(network, BASE_AT);
  const result = submitOracleRisk(state, network, config, request(), {
    latencySec: 60,
    executionFailureBps: 10_000,
    maxAttempts: 2,
    retryDelaySec: 300,
  });
  assert.equal(result.status, 'failed');
  assert.equal(result.state, state);
  assert.equal(result.state.oracleRiskSnapshots.length, 0);
  assert.deepEqual(result.attempts.map(({ attemptedAt, failed }) => ({ attemptedAt, failed })), [
    { attemptedAt: BASE_AT + TICK_SEC + 60, failed: true },
    { attemptedAt: BASE_AT + TICK_SEC + 360, failed: true },
  ]);
});

test('retries the same candidate and reproduces the paired failure path exactly', () => {
  const state = createInitialSimulationState(network, BASE_AT);
  const pairedTreatment = {
    latencySec: 0,
    executionFailureBps: 1_040,
    maxAttempts: 2,
    retryDelaySec: 300,
  };
  const firstRun = submitOracleRisk(state, network, config, request(), pairedTreatment);
  const pairedRun = submitOracleRisk(state, network, config, request(), pairedTreatment);
  assert.equal(firstRun.status, 'submitted');
  assert.deepEqual(firstRun.attempts.map(({ failureDrawBps }) => failureDrawBps), [1_039, 8_641]);
  assert.deepEqual(firstRun.attempts.map(({ failed }) => failed), [true, false]);
  assert.deepEqual(pairedRun, firstRun);
  assert.equal(firstRun.state.oracleRiskSnapshots[0]!.attemptCount, 2);
  assert.equal(firstRun.state.oracleRiskSnapshots[0]!.failedAttemptCount, 1);
});

test('rejects unbounded or malformed Oracle treatments', () => {
  const state = createInitialSimulationState(network, BASE_AT);
  assert.throws(
    () => submitOracleRisk(state, network, config, request(), {
      latencySec: 0,
      executionFailureBps: 0,
      maxAttempts: 0,
      retryDelaySec: 0,
    }),
    /INVALID_ORACLE_MAX_ATTEMPTS/,
  );
  assert.throws(
    () => submitOracleRisk(state, network, config, request(), {
      latencySec: 0,
      executionFailureBps: 0,
      maxAttempts: 17,
      retryDelaySec: 0,
    }),
    /INVALID_ORACLE_MAX_ATTEMPTS/,
  );
  assert.throws(
    () => submitOracleRisk(state, network, config, request(), {
      latencySec: 0,
      executionFailureBps: 10_001,
      maxAttempts: 1,
      retryDelaySec: 0,
    }),
    /INVALID_ORACLE_EXECUTION_FAILURE_BPS/,
  );
});

test('accepts concurrent fund submissions with one event time and independent completion order', () => {
  const treatment = {
    latencySec: 60,
    executionFailureBps: 0,
    maxAttempts: 1,
    retryDelaySec: 0,
  };
  const initial = createInitialSimulationState(network, BASE_AT);
  const first = submitOracleRisk(initial, network, config, {
    replicateId: 0,
    tick: 0,
    fundId: network.funds[0]!.id,
    occurredAt: BASE_AT,
    requestedSharesInWindow: 0,
  }, treatment);
  const second = submitOracleRisk(first.state, network, config, {
    replicateId: 0,
    tick: 0,
    fundId: network.funds[1]!.id,
    occurredAt: BASE_AT,
    requestedSharesInWindow: 0,
  }, treatment);

  assert.equal(first.status, 'submitted');
  assert.equal(second.status, 'submitted');
  assert.equal(second.state.nowSec, BASE_AT + 60);
  assert.equal(second.state.oracleRiskSnapshots.length, 2);
  assert.ok(second.state.oracleRiskSnapshots.every(({ occurredAt }) => occurredAt === BASE_AT));
});

test('still rejects a backdated submission for the same fund', () => {
  const first = submitOracleRisk(
    createInitialSimulationState(network, BASE_AT),
    network,
    config,
    request(),
  );
  assert.throws(() => submitOracleRisk(first.state, network, config, {
    ...request(),
    tick: 2,
    occurredAt: BASE_AT,
  }), /ORACLE_OCCURRED_BEFORE_LATEST_FUND_SUBMISSION/);
});
