import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { parseSimulationConfig } from '../core/config';
import { parsePilotCalibrationConfig } from './config';
import {
  configForCalibrationCandidate,
  createCalibrationCandidates,
  selectCalibrationCandidate,
} from './grid';
import type { CalibrationCandidateSummary } from './types';

const baseline = parseSimulationConfig(JSON.parse(readFileSync(
  new URL('../../config/pilot-baseline.json', import.meta.url),
  'utf8',
)) as unknown);
const calibration = parsePilotCalibrationConfig(JSON.parse(readFileSync(
  new URL('../../config/pilot-calibration.json', import.meta.url),
  'utf8',
)) as unknown);

function summary(
  candidate: ReturnType<typeof createCalibrationCandidates>[number],
  eligibleForValidation: boolean,
): CalibrationCandidateSummary {
  return {
    candidate,
    observationCount: 6,
    flags: eligibleForValidation ? [] : ['PEAK_REQUEST_PRESSURE_SATURATED'],
    eligibleForValidation,
    noShockMeanAcceptedRequestRateBps: 100,
    maximumPeakRequestPressureBps: 1_000,
    meanWithinReplicateRegimeLatentRangeBps: 10,
  };
}

test('creates a deterministic full Cartesian calibration grid', () => {
  const candidates = createCalibrationCandidates(calibration);
  assert.equal(candidates.length, 27);
  assert.deepEqual(candidates[0], {
    candidateId: 'candidate-i1-f1-d1',
    interceptLogOdds: -6.906754778648554,
    redemptionRequestFractionBps: 1_000,
    demandTransmissionBps: 250,
  });
  assert.equal(new Set(candidates.map(({ candidateId }) => candidateId)).size, 27);
});

test('selects the eligible candidate closest to the existing baseline', () => {
  const candidates = createCalibrationCandidates(calibration);
  const selected = selectCalibrationCandidate([
    summary(candidates[0]!, true),
    summary(candidates.at(-1)!, false),
    summary(candidates[7]!, true),
  ], baseline);
  assert.equal(selected?.candidateId, candidates[7]!.candidateId);
  assert.equal(selectCalibrationCandidate([
    summary(candidates[0]!, false),
  ], baseline), null);
});

test('changes only the declared behavior and demand-transmission calibration fields', () => {
  const candidate = createCalibrationCandidates(calibration)[0]!;
  const config = configForCalibrationCandidate(baseline, candidate);
  assert.equal(config.behavior.coefficients.interceptLogOdds, candidate.interceptLogOdds);
  assert.equal(
    config.liquidity.redemptionRequestFractionBps,
    candidate.redemptionRequestFractionBps,
  );
  assert.equal(config.propagation.investorOverlapTransmissionBps, candidate.demandTransmissionBps);
  assert.equal(config.propagation.publicRiskTransmissionBps, candidate.demandTransmissionBps);
  assert.equal(config.propagation.publicControlTransmissionBps, candidate.demandTransmissionBps);
  assert.equal(
    config.propagation.sharedAssetPassThroughBps,
    baseline.propagation.sharedAssetPassThroughBps,
  );
  assert.equal(config.network.networkSeed, baseline.network.networkSeed);
  assert.equal(config.shock.seed, baseline.shock.seed);
  assert.equal(config.behavior.seed, baseline.behavior.seed);
});
