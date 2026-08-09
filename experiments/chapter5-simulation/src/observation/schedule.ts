import { MAX_BPS } from '../artifact/risk/calc';
import { firstScheduledObservationAt } from '../artifact/simulation/observation';
import type { SimulationConfig } from '../core/config';
import { randomIntegerBelow, type RandomDrawKey } from '../core/rng';
import type { RiskDisclosure } from '../disclosure/types';
import type { NetworkModel } from '../network/types';
import type { InvestorObservationSchedule, InvestorRiskObservation } from './types';

type CandidateObservation = InvestorRiskObservation & { sourceSubmittedAt: number };

function requireSafeNonNegative(value: number, field: string): void {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`INVALID_${field}`);
}

function scheduleKey(
  config: SimulationConfig,
  replicateId: number,
  investorId: string,
  purpose: string,
): RandomDrawKey {
  return {
    masterSeed: BigInt(config.observation.seed),
    replicateId,
    entityId: investorId,
    moduleId: 'observation-schedule',
    tick: 0,
    drawPurpose: purpose,
  };
}

export function generateInvestorObservationSchedules(
  config: SimulationConfig,
  network: NetworkModel,
  replicateId: number,
  scheduleAnchorAt: number,
): InvestorObservationSchedule[] {
  requireSafeNonNegative(replicateId, 'OBSERVATION_REPLICATE_ID');
  requireSafeNonNegative(scheduleAnchorAt, 'OBSERVATION_SCHEDULE_ANCHOR');
  return network.investors.map(({ id: investorId }) => {
    const startOffset = randomIntegerBelow(
      scheduleKey(config, replicateId, investorId, 'start-offset-second'),
      config.observation.startOffsetUpperExclusiveSec,
    );
    const pollingIntervalIndex = randomIntegerBelow(
      scheduleKey(config, replicateId, investorId, 'polling-interval-index'),
      config.observation.pollingIntervalsSec.length,
    );
    const observationStartAt = scheduleAnchorAt + startOffset;
    requireSafeNonNegative(observationStartAt, 'OBSERVATION_START_AT');
    return {
      investorId,
      observationStartAt,
      pollingIntervalSec: config.observation.pollingIntervalsSec[pollingIntervalIndex]!,
    };
  });
}

function observeOne(
  disclosure: RiskDisclosure,
  schedule: InvestorObservationSchedule,
): CandidateObservation {
  if (disclosure.audience !== 'public') throw new Error('INVESTOR_CANNOT_OBSERVE_REGULATOR_VIEW');
  requireSafeNonNegative(schedule.observationStartAt, 'OBSERVATION_START_AT');
  if (!Number.isSafeInteger(schedule.pollingIntervalSec) || schedule.pollingIntervalSec <= 0) {
    throw new Error('INVALID_OBSERVATION_POLLING_INTERVAL');
  }
  const observedAt = firstScheduledObservationAt(
    disclosure.disclosedAt,
    schedule.observationStartAt,
    schedule.pollingIntervalSec,
  );
  requireSafeNonNegative(observedAt, 'OBSERVED_AT');
  return {
    investorId: schedule.investorId,
    fundId: disclosure.fundId,
    regimeId: disclosure.regimeId,
    sourceSubmissionId: disclosure.sourceSubmissionId,
    sourceSubmittedAt: disclosure.sourceSubmittedAt,
    disclosedAt: disclosure.disclosedAt,
    observedAt,
    thresholdBps: disclosure.thresholdBps,
    thresholdIdentifiable: disclosure.thresholdIdentifiable,
    signal: disclosure.signal,
  };
}

export function observeRiskDisclosures(
  disclosures: readonly RiskDisclosure[],
  schedules: readonly InvestorObservationSchedule[],
): InvestorRiskObservation[] {
  const latestByInvestorFundAndPoll = new Map<string, CandidateObservation>();
  for (const disclosure of disclosures) {
    for (const schedule of schedules) {
      const observation = observeOne(disclosure, schedule);
      const key = `${observation.investorId}\u0000${observation.fundId}\u0000${observation.observedAt}`;
      const current = latestByInvestorFundAndPoll.get(key);
      if (
        !current
        || observation.sourceSubmittedAt > current.sourceSubmittedAt
        || (
          observation.sourceSubmittedAt === current.sourceSubmittedAt
          && observation.sourceSubmissionId > current.sourceSubmissionId
        )
      ) {
        latestByInvestorFundAndPoll.set(key, observation);
      }
    }
  }
  return [...latestByInvestorFundAndPoll.values()]
    .sort((left, right) => (
      left.observedAt - right.observedAt
      || left.investorId.localeCompare(right.investorId)
      || left.fundId.localeCompare(right.fundId)
      || left.sourceSubmissionId.localeCompare(right.sourceSubmissionId)
    ))
    .map(({ sourceSubmittedAt: _sourceSubmittedAt, ...observation }) => observation);
}

export function computeSignalSynchronicityBps(
  observedAtValues: readonly number[],
  bucketAnchorAt: number,
  bucketSec: number,
): number {
  requireSafeNonNegative(bucketAnchorAt, 'SYNCHRONICITY_BUCKET_ANCHOR');
  if (!Number.isSafeInteger(bucketSec) || bucketSec <= 0) {
    throw new Error('INVALID_SYNCHRONICITY_BUCKET_SEC');
  }
  if (observedAtValues.length === 0) return 0;
  const counts = new Map<number, number>();
  for (const observedAt of observedAtValues) {
    requireSafeNonNegative(observedAt, 'SYNCHRONICITY_OBSERVED_AT');
    if (observedAt < bucketAnchorAt) throw new Error('OBSERVATION_BEFORE_SYNCHRONICITY_ANCHOR');
    const bucket = Math.floor((observedAt - bucketAnchorAt) / bucketSec);
    counts.set(bucket, (counts.get(bucket) ?? 0) + 1);
  }
  const numerator = [...counts.values()].reduce(
    (sum, count) => sum + BigInt(count) * BigInt(count) * BigInt(MAX_BPS),
    0n,
  );
  return Number(numerator / (BigInt(observedAtValues.length) ** 2n));
}
