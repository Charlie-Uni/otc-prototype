import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { parseSimulationConfig } from '../core/config';
import { TICK_SEC } from '../core/pipeline';
import { createRiskDisclosureTimeline } from '../disclosure/engine';
import type { RiskDisclosure } from '../disclosure/types';
import { generateNetworkModel } from '../network/generator';
import { riskSnapshotFixture } from '../testing/oracle-snapshot';
import {
  computeSignalSynchronicityBps,
  generateInvestorObservationSchedules,
  observeRiskDisclosures,
} from './schedule';

const config = parseSimulationConfig(JSON.parse(readFileSync(
  new URL('../../config/pilot-baseline.json', import.meta.url),
  'utf8',
)) as unknown);
const network = generateNetworkModel(config);
const CYCLE_START = config.shock.cycleStartAt;

test('generates deterministic paired schedules without a regime dimension', () => {
  const first = generateInvestorObservationSchedules(config, network, 0, CYCLE_START);
  const repeated = generateInvestorObservationSchedules(config, network, 0, CYCLE_START);
  const nextReplicate = generateInvestorObservationSchedules(config, network, 1, CYCLE_START);
  assert.deepEqual(repeated, first);
  assert.notDeepEqual(nextReplicate, first);
  assert.equal(first.length, config.network.investorCount);
  for (const schedule of first) {
    assert.ok(schedule.observationStartAt >= CYCLE_START);
    assert.ok(
      schedule.observationStartAt
      < CYCLE_START + config.observation.startOffsetUpperExclusiveSec,
    );
    assert.ok(config.observation.pollingIntervalsSec.includes(schedule.pollingIntervalSec));
  }
});

test('uses the vendored first-observation schedule and keeps only the latest same-poll snapshot', () => {
  const base: RiskDisclosure = {
    sourceSubmissionId: 'early',
    fundId: 'fund-001',
    regimeId: 'R1',
    audience: 'public',
    sourceOccurredAt: 1_101,
    sourceSubmittedAt: 1_101,
    disclosedAt: 1_101,
    thresholdBps: 6_000,
    thresholdIdentifiable: true,
    signal: { kind: 'exact', valueBps: 6_500, band: 'red' },
  };
  const observations = observeRiskDisclosures(
    [base, {
      ...base,
      sourceSubmissionId: 'latest',
      sourceOccurredAt: 1_110,
      sourceSubmittedAt: 1_110,
      disclosedAt: 1_110,
    }],
    [{ investorId: 'investor-001', observationStartAt: 1_000, pollingIntervalSec: 60 }],
  );
  assert.equal(observations.length, 1);
  assert.equal(observations[0]!.observedAt, 1_120);
  assert.equal(observations[0]!.sourceSubmissionId, 'latest');
  assert.equal(Object.hasOwn(observations[0]!, 'sourceSubmittedAt'), false);
});

test('derives greater time concentration from R0 boundary coalescing than R1 real-time release', () => {
  const sources = [
    riskSnapshotFixture('s1', 'fund-001', CYCLE_START + 1),
    riskSnapshotFixture('s2', 'fund-002', CYCLE_START + 2 * TICK_SEC + 1),
    riskSnapshotFixture('s3', 'fund-003', CYCLE_START + 4 * TICK_SEC + 1),
  ];
  const schedules = generateInvestorObservationSchedules(config, network, 0, CYCLE_START);
  const r0Observations = observeRiskDisclosures(
    createRiskDisclosureTimeline(sources, 'R0', 'public', 6_000),
    schedules,
  );
  const r1Observations = observeRiskDisclosures(
    createRiskDisclosureTimeline(sources, 'R1', 'public', 6_000),
    schedules,
  );
  const r0Synchronicity = computeSignalSynchronicityBps(
    r0Observations.map(({ observedAt }) => observedAt),
    CYCLE_START,
    config.observation.synchronicityBucketSec,
  );
  const r1Synchronicity = computeSignalSynchronicityBps(
    r1Observations.map(({ observedAt }) => observedAt),
    CYCLE_START,
    config.observation.synchronicityBucketSec,
  );
  assert.equal(r0Synchronicity, 10_000);
  assert.equal(r1Synchronicity, 3_333);
  assert.ok(r0Synchronicity > r1Synchronicity);
});

test('computes bounded synchronicity and rejects invalid observation inputs', () => {
  assert.equal(computeSignalSynchronicityBps([], 0, TICK_SEC), 0);
  assert.equal(computeSignalSynchronicityBps([1, 2], 0, TICK_SEC), 10_000);
  assert.equal(computeSignalSynchronicityBps([1, TICK_SEC + 1], 0, TICK_SEC), 5_000);
  assert.equal(
    computeSignalSynchronicityBps([TICK_SEC + 1, 1], 0, TICK_SEC),
    5_000,
  );
  assert.throws(
    () => computeSignalSynchronicityBps([0], 1, TICK_SEC),
    /OBSERVATION_BEFORE_SYNCHRONICITY_ANCHOR/,
  );

  const regulatorDisclosure: RiskDisclosure = {
    sourceSubmissionId: 's1',
    fundId: 'fund-001',
    regimeId: 'R2',
    audience: 'regulator',
    sourceOccurredAt: 1,
    sourceSubmittedAt: 1,
    disclosedAt: 1,
    thresholdBps: 6_000,
    thresholdIdentifiable: true,
    signal: { kind: 'exact', valueBps: 6_500, band: 'red' },
  };
  assert.throws(
    () => observeRiskDisclosures(
      [regulatorDisclosure],
      [{ investorId: 'investor-001', observationStartAt: 0, pollingIntervalSec: 60 }],
    ),
    /INVESTOR_CANNOT_OBSERVE_REGULATOR_VIEW/,
  );
});
