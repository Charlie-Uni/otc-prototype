import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import type { TransparencyRegimeId } from '../artifact/risk/regimes';
import { FormalAnalysisAccumulator } from '../formal/reporting';
import {
  createFormalReportEvidence,
  persistFormalReportEvidence,
} from '../formal/report-storage';
import type { FormalShardSetSummary } from '../formal/shard-set';
import type { FormalArmMeasurement, FormalPairObservation } from '../formal/measurement';
import type {
  DetectionLagOutcome,
  FundRunOutcome,
  RunOutcomeMetrics,
} from '../metrics/outcome-types';
import { parseFormalAnalysisPlan } from '../preregistration/analysis-plan';
import { semanticDigestSha256 } from './digest';

const analysisPlan = parseFormalAnalysisPlan(JSON.parse(readFileSync(
  new URL('../../config/formal-analysis-plan.json', import.meta.url),
  'utf8',
)) as unknown);

type ArmValues = {
  targetRequested: number;
  unshockedRequested: number;
  targetLoss: number;
  unshockedLoss: number;
  targetDepletionBps: number;
  pendingShares: number;
  latentShares: number;
  blockedShares: number;
  peakBps: number;
};

const DEFAULT_VALUES: ArmValues = {
  targetRequested: 100,
  unshockedRequested: 100,
  targetLoss: 100,
  unshockedLoss: 100,
  targetDepletionBps: 100,
  pendingShares: 10,
  latentShares: 200,
  blockedShares: 0,
  peakBps: 100,
};

function fundOutcome(
  fundId: string,
  shocked: boolean,
  windowDays: number,
  requestedShares: number,
  lossAmount: number,
  values: ArmValues,
): FundRunOutcome {
  const pendingShares = Math.min(requestedShares, values.pendingShares);
  return {
    fundId,
    shocked,
    windowDays,
    initialAum: 10_000,
    initialTotalShares: 10_000,
    cumulativeRequestedShares: requestedShares,
    cumulativeRequestRateBps: requestedShares,
    cumulativeLatentRequestedShares: Math.max(requestedShares, values.latentShares),
    cumulativeLatentRequestRateBps: Math.max(requestedShares, values.latentShares),
    peakRedemptionBps: shocked ? values.peakBps : Math.trunc(values.peakBps / 2),
    settledShares: requestedShares - pendingShares,
    pendingRequestCount: pendingShares > 0 ? 1 : 0,
    pendingShares,
    pendingRateBps: requestedShares === 0 ? 0 : Math.trunc(pendingShares * 10_000 / requestedShares),
    settlementDelay: {
      settledRequestCount: requestedShares > pendingShares ? 1 : 0,
      meanSec: requestedShares > pendingShares ? 0 : null,
      medianSec: requestedShares > pendingShares ? 0 : null,
      p95Sec: requestedShares > pendingShares ? 0 : null,
    },
    blockedSharesByGate: shocked ? values.blockedShares : 0,
    gateFrozenShareRatioBps: 0,
    totalExtraWaitingSec: 0,
    averageExtraWaitingSec: requestedShares > pendingShares ? 0 : null,
    lossAmount,
    lossMagnitudeBps: lossAmount,
    fireSaleDiscountLoss: 0,
    minimumLiquidityBufferRatioBps: 10_000 - (shocked ? values.targetDepletionBps : 0),
    liquidityBufferDepletionBps: shocked ? values.targetDepletionBps : 0,
    firstLiquidityBufferExhaustionAt: null,
  };
}

function runOutcome(
  regimeId: TransparencyRegimeId,
  replicateId: number,
  windowDays: number,
  values: ArmValues,
): RunOutcomeMetrics {
  const shockAt = 1_000 + replicateId;
  const detected: DetectionLagOutcome = {
    status: 'detected',
    detectedAt: shockAt,
    lagSec: 0,
    sourceSubmissionId: 'submission',
  };
  return {
    schemaVersion: 1,
    treatmentId: regimeId,
    configDigestSha256: 'c'.repeat(64),
    regimeId,
    replicateId,
    scenarioId: `valuation-r${replicateId}-m2000`,
    shockAt,
    windowDays,
    detection: {
      fundId: 'F0',
      shockAt,
      system: detected,
      regulatorDisclosure: detected,
      publicDisclosure: detected,
      publicObservation: detected,
    },
    funds: [
      fundOutcome(
        'F0',
        true,
        windowDays,
        values.targetRequested,
        values.targetLoss,
        values,
      ),
      fundOutcome(
        'F1',
        false,
        windowDays,
        values.unshockedRequested,
        values.unshockedLoss,
        values,
      ),
    ],
  };
}

function armMeasurement(
  pairId: string,
  family: FormalPairObservation['family'],
  arm: FormalArmMeasurement['arm'],
  regimeId: TransparencyRegimeId,
  replicateId: number,
  values: ArmValues,
  detection: DetectionLagOutcome,
): FormalArmMeasurement {
  const shockAt = 1_000 + replicateId;
  const withoutDigest = {
    schemaVersion: 1 as const,
    cellId: `${pairId}-${arm}`,
    pairId,
    family,
    arm,
    replicateId,
    treatmentId: `${pairId}-${arm}`,
    regimeId,
    shockEnabled: arm !== 'no_shock',
    scenario: {
      scenarioId: `valuation-r${replicateId}-m2000`,
      shockType: 'valuation' as const,
      replicateId,
      targetFundId: 'F0',
      shockAt,
      cycleOffsetSec: replicateId,
      navDropBps: 2_000,
    },
    configDigestSha256: 'c'.repeat(64),
    treatmentDigestSha256: 'd'.repeat(64),
    runDigestSha256: semanticDigestSha256({ pairId, arm, regimeId, replicateId }),
    sensitivityThresholdBps: 6_000,
    regulatorWarningThresholdLag: detection,
    outcomesByWindow: [30, 60, 90].map((windowDays) => (
      runOutcome(regimeId, replicateId, windowDays, values)
    )),
  };
  return { ...withoutDigest, semanticDigestSha256: semanticDigestSha256(withoutDigest) };
}

function observation(options: {
  pairId: string;
  family: FormalPairObservation['family'];
  regimeId?: TransparencyRegimeId;
  replicateId: number;
  first?: ArmValues;
  second?: ArmValues;
  detection?: DetectionLagOutcome;
}): FormalPairObservation {
  const regimeId = options.regimeId ?? 'R1';
  const detection = options.detection ?? {
    status: 'detected',
    detectedAt: 1_000 + options.replicateId,
    lagSec: 0,
    sourceSubmissionId: 'submission',
  };
  const primary = options.family === 'primary_policy';
  const firstArm = primary ? 'shock' : 'baseline';
  const secondArm = primary ? 'no_shock' : 'comparison';
  const arms: [FormalArmMeasurement, FormalArmMeasurement] = [
    armMeasurement(
      options.pairId,
      options.family,
      firstArm,
      regimeId,
      options.replicateId,
      options.first ?? DEFAULT_VALUES,
      detection,
    ),
    armMeasurement(
      options.pairId,
      options.family,
      secondArm,
      regimeId,
      options.replicateId,
      options.second ?? DEFAULT_VALUES,
      detection,
    ),
  ];
  const withoutDigest = {
    schemaVersion: 1 as const,
    designDigestSha256: 'a'.repeat(64),
    pairId: options.pairId,
    family: options.family,
    replicateId: options.replicateId,
    authorization: {
      preregistrationTag: 'chapter5-sim-prereg-v2' as const,
      preregistrationCommit: 'a'.repeat(40),
      executionCommit: 'b'.repeat(40),
      preregistrationLockSha256: 'c'.repeat(64),
      foundationLockSha256: 'd'.repeat(64),
    },
    arms,
    primaryShockLinkedDetection: primary ? {
      fundId: 'F0',
      shockAt: 1_000 + options.replicateId,
      anchor: 'paired_valuation_haircut_increase' as const,
      system: detection,
      regulatorDisclosure: detection,
    } : null,
  };
  return { ...withoutDigest, semanticDigestSha256: semanticDigestSha256(withoutDigest) };
}

test('fixes H5 signs as lower-control outcomes minus full-control outcomes', () => {
  const accumulator = new FormalAnalysisAccumulator(analysisPlan);
  for (const replicateId of [0, 1]) accumulator.addObservation(observation({
    pairId: 'ROBUST-CONTROL_PHI-0',
    family: 'robustness',
    replicateId,
    first: { ...DEFAULT_VALUES, targetLoss: 100, unshockedLoss: 100, targetDepletionBps: 100 },
    second: { ...DEFAULT_VALUES, targetLoss: 300, unshockedLoss: 300, targetDepletionBps: 300 },
  }));
  const report = accumulator.finish();
  const loss = report.estimateSummaries.find(({ testId }) => (
    testId === 'ROBUST-CONTROL_PHI-0:LossReduction:w30'
  ));
  const liquidity = report.estimateSummaries.find(({ testId }) => (
    testId === 'ROBUST-CONTROL_PHI-0:LiquidityBenefit:w30'
  ));
  const relativeLoss = report.estimateSummaries.find(({ testId }) => (
    testId === 'ROBUST-CONTROL_PHI-0:RelativeLossReduction:w30'
  ));
  assert.equal(loss?.estimate?.mean, 200);
  assert.equal(relativeLoss?.estimate?.mean, 6_666);
  assert.equal(liquidity?.estimate?.mean, 200);
  assert.match(loss?.orientation ?? '', /positive favors full control/);
  assert.ok(report.supplementaryEstimateSummaries.some(({ pairId, metricId }) => (
    pairId === 'ROBUST-CONTROL_PHI-0' && metricId === 'AggregateLossMagnitude'
  )));
});

test('maps A1-A7 into only their declared hypothesis families', () => {
  const accumulator = new FormalAnalysisAccumulator(analysisPlan);
  const pairFamilies = [
    ['A1', ['H2', 'H3']],
    ['A2', ['H2']],
    ['A3', ['H2', 'H3']],
    ['A4', ['H4']],
    ['A5', ['H4']],
    ['A6', ['H6']],
    ['A7', ['H4']],
  ] as const;
  for (const replicateId of [0, 1]) {
    pairFamilies.forEach(([pairId]) => accumulator.addObservation(observation({
      pairId,
      family: 'ablation',
      replicateId,
      first: { ...DEFAULT_VALUES, unshockedRequested: 300 },
      second: { ...DEFAULT_VALUES, unshockedRequested: 100 },
    })));
  }
  const report = accumulator.finish();
  pairFamilies.forEach(([pairId, expectedHypotheses]) => {
    const actual = [...new Set(report.estimateSummaries
      .filter((row) => row.contrastId === pairId)
      .map(({ hypothesisId }) => hypothesisId))].sort();
    assert.deepEqual(actual, [...expectedHypotheses].sort());
  });
  assert.ok(report.estimateSummaries.some(({ testId }) => (
    testId === 'A6:SpilloverAffectedShare:w30'
  )));
  assert.ok(report.supplementaryEstimateSummaries.some(({ pairId, metricId }) => (
    pairId === 'A6' && metricId === 'SpilloverScope.AffectedFundShare@250'
  )));
  assert.ok(report.estimateSummaries.some(({ testId }) => (
    testId === 'A7:SpilloverRedemption:w30'
  )));
  assert.ok(!report.estimateSummaries.some(({ testId }) => (
    testId === 'A7:LossMagnitude:w30'
  )));
  assert.ok(report.supplementaryEstimateSummaries.some(({ pairId, metricId }) => (
    pairId === 'A7' && metricId === 'SpilloverScope.AffectedFundShare@250'
  )));
});

test('joins identical primary scenarios across R0-R4 before computing H1 and H3', () => {
  const accumulator = new FormalAnalysisAccumulator(analysisPlan);
  const lags: Record<TransparencyRegimeId, number> = {
    R0: 604_800,
    R1: 0,
    R2: 0,
    R3: 86_400,
    R4: 0,
  };
  for (const replicateId of [0, 1]) {
    for (const regimeId of ['R0', 'R1', 'R2', 'R3', 'R4'] as const) {
      accumulator.addObservation(observation({
        pairId: `POLICY-${regimeId}-2000`,
        family: 'primary_policy',
        regimeId,
        replicateId,
        detection: {
          status: 'detected',
          detectedAt: 1_000 + replicateId + lags[regimeId],
          lagSec: lags[regimeId],
          sourceSubmissionId: `${regimeId}-${replicateId}`,
        },
      }));
    }
  }
  const report = accumulator.finish();
  assert.equal(
    report.estimateSummaries.find(({ testId }) => testId === 'H1:R0_MINUS_R1:m2000')
      ?.estimate?.mean,
    604_800,
  );
  assert.equal(
    report.estimateSummaries.find(({ testId }) => testId === 'H1:R3_MINUS_R1:m2000')
      ?.estimate?.mean,
    86_400,
  );
  assert.equal(report.policyDetectionSummaries.length, 10);
  assert.ok(report.policyDetectionSummaries.some(({ metricId }) => (
    metricId === 'RegulatorWarningThresholdLag'
  )));
  assert.ok(report.supplementaryEstimateSummaries.some(({ pairId, metricId, orientation }) => (
    pairId === 'POLICY-R0-2000'
    && metricId === 'AcceptedRequestRate'
    && orientation === 'shock minus no-shock'
  )));
  assert.ok(report.holmAdjustedPrimaryPValues.some(({ hypothesisId }) => hypothesisId === 'H1'));
});

test('reports cross-policy detection censoring without numeric imputation', () => {
  const accumulator = new FormalAnalysisAccumulator(analysisPlan);
  for (const replicateId of [0, 1]) {
    for (const regimeId of ['R0', 'R1', 'R2', 'R3', 'R4'] as const) {
      accumulator.addObservation(observation({
        pairId: `POLICY-${regimeId}-2000`,
        family: 'primary_policy',
        regimeId,
        replicateId,
        detection: regimeId === 'R2'
          ? { status: 'censored', reason: 'threshold_not_identifiable' }
          : {
              status: 'detected',
              detectedAt: 1_000 + replicateId,
              lagSec: 0,
              sourceSubmissionId: `${regimeId}-${replicateId}`,
            },
      }));
    }
  }
  const report = accumulator.finish();
  const row = report.estimateSummaries.find(({ testId }) => testId === 'H1:R0_MINUS_R2:m2000');
  assert.equal(row?.observedCount, 0);
  assert.equal(row?.missingCount, 2);
  assert.equal(row?.missingRateBps, 10_000);
  assert.equal(row?.estimate, null);
  assert.deepEqual(row?.missingByReason, {
    subtrahend_threshold_not_identifiable: 2,
  });
});

test('anchors a report to one result-set digest and publishes it without replacement', () => {
  const accumulator = new FormalAnalysisAccumulator(analysisPlan);
  for (const replicateId of [0, 1]) accumulator.addObservation(observation({
    pairId: 'A1',
    family: 'ablation',
    replicateId,
  }));
  const report = accumulator.finish();
  const shardSet: FormalShardSetSummary = {
    schemaVersion: 1,
    designDigestSha256: 'a'.repeat(64),
    shardPlanDigestSha256: 'b'.repeat(64),
    authorization: {
      preregistrationTag: 'chapter5-sim-prereg-v2',
      preregistrationCommit: 'c'.repeat(40),
      executionCommit: 'd'.repeat(40),
      preregistrationLockSha256: 'e'.repeat(64),
      foundationLockSha256: 'f'.repeat(64),
    },
    expectedShardCount: 1,
    loadedShardCount: 1,
    expectedPairReplicates: 2,
    loadedPairObservations: 2,
    shardDigests: [{ shardId: 'A1:r0000-0001', semanticDigestSha256: 'f'.repeat(64) }],
    resultSetDigestSha256: '1'.repeat(64),
    failureEvidence: [],
    semanticDigestSha256: '2'.repeat(64),
  };
  const evidence = createFormalReportEvidence(shardSet, report);
  const directory = mkdtempSync(join(tmpdir(), 'chapter5-formal-report-'));
  const path = join(directory, 'report.json');
  try {
    assert.equal(persistFormalReportEvidence(path, evidence).created, true);
    assert.equal(persistFormalReportEvidence(path, evidence).created, false);
    const conflict = { ...evidence, resultSetDigestSha256: '9'.repeat(64) };
    conflict.semanticDigestSha256 = semanticDigestSha256({
      ...conflict,
      semanticDigestSha256: undefined,
    });
    assert.throws(
      () => persistFormalReportEvidence(path, conflict),
      /EXISTING_FORMAL_REPORT_CONFLICT/,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
