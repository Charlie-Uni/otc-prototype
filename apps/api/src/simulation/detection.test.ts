import assert from 'node:assert/strict';
import test from 'node:test';
import { LifecycleEvent } from '../audit/lifecycle';
import { analyzeDetectionLags, firstScheduledObservationAt } from './detection';

const hash = `0x${'1'.repeat(64)}` as const;
const txHash = `0x${'2'.repeat(64)}` as const;
const address = `0x${'3'.repeat(40)}` as const;
const fundId = `0x${'4'.repeat(64)}` as const;

function riskEvent(score: number, blockNumber: number, submittedAt: number): LifecycleEvent {
  return {
    eventId: `31337:${txHash}:${blockNumber}`,
    chainId: 31_337,
    contractAddress: address,
    contractName: 'RiskRegistry',
    eventName: 'RiskMetricsSubmitted',
    category: 'risk',
    fundId,
    transactionHash: txHash,
    logIndex: 0,
    blockNumber,
    occurredAt: 1_000,
    submittedAt,
    commitmentHash: hash,
    payload: { riskScoreBps: score, riskLevel: 'red', gated: true },
  };
}

test('anchors detection to the first raw score crossing rather than display state', () => {
  const analysis = analyzeDetectionLags(
    [riskEvent(5_900, 1, 1_050), riskEvent(6_200, 2, 1_100), riskEvent(8_000, 3, 1_200)],
    {
      scenarioId: 'valuation-shock',
      shockAt: 1_000,
      detectionThresholdBps: 6_000,
      observationStartAt: 1_000,
      pollingIntervalSec: 60,
    },
  );

  assert.equal(analysis.anchor.riskScoreBps, 6_200);
  assert.equal(analysis.anchor.submittedAt, 1_100);
  assert.equal(analysis.systemDetectionLagSec, 100);
  const r1Public = analysis.rows.find((row) => row.regime === 'R1' && row.audience === 'public');
  assert.equal(r1Public?.disclosureDetectionLagSec, 100);
  assert.equal(r1Public?.observationDetectionLagSec, 120);
});

test('produces the expected R1/R2/R4, R3, R0 disclosure-lag ordering', () => {
  const analysis = analyzeDetectionLags(
    [riskEvent(7_100, 1, 1_100)],
    {
      scenarioId: 'ordering',
      shockAt: 1_000,
      detectionThresholdBps: 6_000,
      observationStartAt: 1_000,
      pollingIntervalSec: 60,
    },
  );
  const publicLag = (regime: string) => analysis.rows.find(
    (row) => row.regime === regime && row.audience === 'public',
  )?.disclosureDetectionLagSec as number;

  assert.equal(publicLag('R1'), publicLag('R2'));
  assert.equal(publicLag('R2'), publicLag('R4'));
  assert.ok(publicLag('R3') > publicLag('R1'));
  assert.ok(publicLag('R0') > publicLag('R3'));
});

test('uses an explicit polling schedule and rejects missing detection events', () => {
  assert.equal(firstScheduledObservationAt(1_101, 1_000, 60), 1_120);
  assert.throws(
    () => analyzeDetectionLags(
      [riskEvent(5_999, 1, 1_100)],
      {
        scenarioId: 'no-crossing',
        shockAt: 1_000,
        detectionThresholdBps: 6_000,
        observationStartAt: 1_000,
        pollingIntervalSec: 60,
      },
    ),
    /DETECTION_EVENT_NOT_FOUND/,
  );
});
