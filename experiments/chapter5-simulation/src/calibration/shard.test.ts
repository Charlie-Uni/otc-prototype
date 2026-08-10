import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { parseSimulationConfig } from '../core/config';
import { parsePilotCalibrationConfig } from './config';
import { createCalibrationCandidates } from './grid';
import { createCalibrationShard, parseCalibrationShard } from './shard';

const baseline = parseSimulationConfig(JSON.parse(readFileSync(
  new URL('../../config/pilot-baseline.json', import.meta.url),
  'utf8',
)) as unknown);
const fullCalibration = parsePilotCalibrationConfig(JSON.parse(readFileSync(
  new URL('../../config/pilot-calibration.json', import.meta.url),
  'utf8',
)) as unknown);

test('binds a calibration shard to its config, candidate, and replicate range', {
  timeout: 20_000,
}, () => {
  const calibration = parsePilotCalibrationConfig({
    ...fullCalibration,
    windowDays: 1,
  });
  const candidate = createCalibrationCandidates(calibration)[0]!;
  const shard = createCalibrationShard(baseline, calibration, candidate, 4, 1, 'a'.repeat(64));
  assert.equal(parseCalibrationShard(shard).observations.length, 6);
  assert.deepEqual(new Set(shard.observations.map(({ replicateId }) => replicateId)), new Set([4]));
  assert.throws(() => parseCalibrationShard({
    ...shard,
    replicateStart: 5,
  }), /CALIBRATION_SHARD_DIGEST_MISMATCH/);
});
