import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { parseSimulationConfig } from '../core/config';
import { generateNetworkModel } from '../network/generator';
import { runSimulation } from '../runner/run';
import { createSimulationTreatment } from '../runner/treatment';
import { createValuationShockScenarios } from '../shocks/scenario';
import { detectionBenefitSec, detectionLagMetrics } from './detection';

const baselineInput = JSON.parse(readFileSync(
  new URL('../../config/pilot-baseline.json', import.meta.url),
  'utf8',
)) as Record<string, Record<string, unknown>>;

function run(regimeId: 'R1' | 'R2', thresholdBps = 6_000, shockEnabled = true) {
  const input = structuredClone(baselineInput);
  input.thresholds.detectionBps = thresholdBps;
  const config = parseSimulationConfig(input);
  const scenario = createValuationShockScenarios(
    config,
    generateNetworkModel(config),
    0,
  )[1]!;
  return runSimulation({
    treatment: createSimulationTreatment(`detection-${regimeId}`, config, regimeId),
    scenario,
    horizonDays: 15,
    shockEnabled,
  });
}

test('separates system, disclosure, and actual observation detection times', () => {
  const metrics = detectionLagMetrics(run('R1'));
  assert.equal(metrics.system.status, 'detected');
  assert.equal(metrics.regulatorDisclosure.status, 'detected');
  assert.equal(metrics.publicDisclosure.status, 'detected');
  assert.equal(metrics.publicObservation.status, 'detected');
  if (
    metrics.system.status === 'detected'
    && metrics.regulatorDisclosure.status === 'detected'
    && metrics.publicDisclosure.status === 'detected'
    && metrics.publicObservation.status === 'detected'
  ) {
    assert.ok(metrics.regulatorDisclosure.detectedAt >= metrics.system.detectedAt);
    assert.ok(metrics.publicDisclosure.detectedAt >= metrics.system.detectedAt);
    assert.ok(metrics.publicObservation.detectedAt >= metrics.publicDisclosure.detectedAt);
  }
});

test('uses explicit censoring when a public aggregate band cannot identify tau', () => {
  const metrics = detectionLagMetrics(run('R2', 5_500));
  assert.equal(metrics.system.status, 'detected');
  assert.deepEqual(metrics.publicDisclosure, {
    status: 'censored',
    reason: 'threshold_not_identifiable',
  });
  assert.deepEqual(metrics.publicObservation, {
    status: 'censored',
    reason: 'threshold_not_identifiable',
  });
  assert.equal(metrics.regulatorDisclosure.status, 'detected');
});

test('does not fabricate a lag when the raw threshold is never crossed', () => {
  const metrics = detectionLagMetrics(run('R1', 10_000, false));
  assert.deepEqual(metrics.system, {
    status: 'censored',
    reason: 'threshold_not_crossed',
  });
  assert.equal(detectionBenefitSec(metrics.system, metrics.regulatorDisclosure), null);
  assert.equal(detectionBenefitSec(
    { status: 'detected', detectedAt: 200, lagSec: 100, sourceSubmissionId: 'r0' },
    { status: 'detected', detectedAt: 150, lagSec: 50, sourceSubmissionId: 'r1' },
  ), 50);
});

test('preserves non-disclosure as the cause of observation censoring', () => {
  const result = run('R1');
  const metrics = detectionLagMetrics({
    ...result,
    publicRiskDisclosures: [],
    riskObservations: [],
  });
  assert.deepEqual(metrics.publicDisclosure, {
    status: 'censored',
    reason: 'not_disclosed_within_horizon',
  });
  assert.deepEqual(metrics.publicObservation, {
    status: 'censored',
    reason: 'not_disclosed_within_horizon',
  });
});

test('does not count a scheduled observation beyond the completed horizon', () => {
  const result = run('R1');
  const horizonEndAt = result.scenario.shockAt + result.horizonDays * 86_400;
  const metrics = detectionLagMetrics({
    ...result,
    riskObservations: result.riskObservations.map((observation) => ({
      ...observation,
      observedAt: horizonEndAt,
    })),
  });
  assert.deepEqual(metrics.publicObservation, {
    status: 'censored',
    reason: 'not_observed_within_horizon',
  });
});

test('distinguishes Oracle non-submission from a score below tau', () => {
  const result = run('R1');
  const targetFundId = result.scenario.targetFundId;
  const metrics = detectionLagMetrics({
    ...result,
    finalState: {
      ...result.finalState,
      oracleRiskSnapshots: result.finalState.oracleRiskSnapshots.filter(({ fundId }) => (
        fundId !== targetFundId
      )),
    },
  });
  assert.deepEqual(metrics.system, {
    status: 'censored',
    reason: 'no_successful_submission',
  });
});
