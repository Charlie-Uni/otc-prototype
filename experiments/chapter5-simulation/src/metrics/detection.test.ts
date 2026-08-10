import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { parseSimulationConfig } from '../core/config';
import {
  disclosureTimeFor,
  getTransparencyRegime,
  type TransparencyRegimeId,
} from '../artifact/risk/regimes';
import { generateNetworkModel } from '../network/generator';
import { runSimulation } from '../runner/run';
import { createSimulationTreatment } from '../runner/treatment';
import { createValuationShockScenarios } from '../shocks/scenario';
import {
  detectionBenefitSec,
  detectionLagMetrics,
  regulatorDetectionLagForThreshold,
  pairedValuationShockDetectionLagMetrics,
} from './detection';

const baselineInput = JSON.parse(readFileSync(
  new URL('../../config/pilot-baseline.json', import.meta.url),
  'utf8',
)) as Record<string, Record<string, unknown>>;

function run(regimeId: TransparencyRegimeId, thresholdBps = 6_000, shockEnabled = true) {
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

test('re-evaluates regulator detection at a pilot threshold without changing the run', () => {
  const result = run('R1');
  const detected = regulatorDetectionLagForThreshold(result, 400);
  assert.equal(detected.status, 'detected');
  assert.throws(
    () => regulatorDetectionLagForThreshold(result, 10_001),
    /INVALID_DETECTION_THRESHOLD/,
  );
});

test('never anchors detection to a snapshot submitted before shockAt', () => {
  const result = run('R1');
  const target = result.finalState.oracleRiskSnapshots.find(({ fundId }) => (
    fundId === result.scenario.targetFundId
  ))!;
  const preShock = {
    ...target,
    submissionId: 'pre-shock-high-score',
    occurredAt: result.scenario.shockAt - 1,
    submittedAt: result.scenario.shockAt - 1,
    riskScoreBps: 10_000,
    detected: true,
  };
  const metrics = detectionLagMetrics({
    ...result,
    finalState: {
      ...result.finalState,
      oracleRiskSnapshots: [preShock, ...result.finalState.oracleRiskSnapshots],
    },
  });
  assert.equal(metrics.system.status, 'detected');
  if (metrics.system.status === 'detected') {
    assert.notEqual(metrics.system.sourceSubmissionId, preShock.submissionId);
    assert.ok(metrics.system.detectedAt >= result.scenario.shockAt);
  }
});

test('anchors primary valuation-shock detection to the first paired haircut increase', () => {
  const result = run('R1', 10_000);
  const noShock = run('R1', 10_000, false);
  const metrics = pairedValuationShockDetectionLagMetrics(result, noShock);
  assert.equal(metrics.anchor, 'paired_valuation_haircut_increase');
  assert.equal(metrics.system.status, 'detected');
  assert.equal(metrics.regulatorDisclosure.status, 'detected');
  if (metrics.system.status === 'detected') {
    const sourceSubmissionId = metrics.system.sourceSubmissionId;
    const source = result.finalState.oracleRiskSnapshots.find(({ submissionId }) => (
      submissionId === sourceSubmissionId
    ));
    assert.ok(source);
    const counterfactual = noShock.finalState.oracleRiskSnapshots.find((snapshot) => (
      snapshot.fundId === result.scenario.targetFundId && snapshot.tick === source.tick
    ));
    assert.ok(counterfactual);
    assert.ok(source.metrics.valuationHaircutBps > counterfactual.metrics.valuationHaircutBps);
  }
});

test('keeps the shock-linked anchor independent from the configurable score threshold', () => {
  const lowThreshold = pairedValuationShockDetectionLagMetrics(
    run('R1', 0),
    run('R1', 0, false),
  );
  const highThreshold = pairedValuationShockDetectionLagMetrics(
    run('R1', 10_000),
    run('R1', 10_000, false),
  );
  assert.deepEqual(lowThreshold, highThreshold);
});

test('rejects reversed or mismatched shock-linked pairs', () => {
  const shocked = run('R1');
  const noShock = run('R1', 6_000, false);
  assert.throws(
    () => pairedValuationShockDetectionLagMetrics(noShock, shocked),
    /INVALID_SHOCK_LINKED_PAIR_ARMS/,
  );
  assert.throws(
    () => pairedValuationShockDetectionLagMetrics(shocked, run('R2', 6_000, false)),
    /SHOCK_LINKED_PAIR_MISMATCH/,
  );
});

test('applies the frozen regulator disclosure boundary after paired shock detection', () => {
  for (const regimeId of ['R0', 'R1', 'R2', 'R3', 'R4'] as const) {
    const shocked = run(regimeId, 10_000);
    const metrics = pairedValuationShockDetectionLagMetrics(
      shocked,
      run(regimeId, 10_000, false),
    );
    assert.equal(metrics.system.status, 'detected');
    assert.equal(metrics.regulatorDisclosure.status, 'detected');
    if (metrics.system.status === 'detected'
      && metrics.regulatorDisclosure.status === 'detected') {
      const regime = getTransparencyRegime(regimeId);
      const expected = regime.visibility === 'public'
        ? disclosureTimeFor(metrics.system.detectedAt, regime)
        : metrics.system.detectedAt;
      assert.equal(metrics.regulatorDisclosure.detectedAt, expected, regimeId);
    }
  }
});
