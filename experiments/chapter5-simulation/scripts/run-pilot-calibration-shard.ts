import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parsePilotCalibrationConfig } from '../src/calibration/config';
import { createCalibrationCandidates } from '../src/calibration/grid';
import { createCalibrationShard } from '../src/calibration/shard';
import { parseSimulationConfig } from '../src/core/config';
import { calibrationImplementationDigest } from './calibration-provenance';

function safeInteger(value: string | undefined, name: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error(`INVALID_${name}`);
  return parsed;
}

const [candidateId, replicateStartValue, replicateCountValue] = process.argv.slice(2);
const replicateStart = safeInteger(replicateStartValue, 'REPLICATE_START');
const replicateCount = safeInteger(replicateCountValue, 'REPLICATE_COUNT');
if (replicateCount === 0) throw new Error('INVALID_REPLICATE_COUNT');

const baseline = parseSimulationConfig(JSON.parse(readFileSync(
  new URL('../config/pilot-baseline.json', import.meta.url),
  'utf8',
)) as unknown);
const calibration = parsePilotCalibrationConfig(JSON.parse(readFileSync(
  new URL('../config/pilot-calibration.json', import.meta.url),
  'utf8',
)) as unknown);
const packageRoot = fileURLToPath(new URL('..', import.meta.url));
const candidate = createCalibrationCandidates(calibration).find((value) => (
  value.candidateId === candidateId
));
if (!candidate) throw new Error('UNKNOWN_CALIBRATION_CANDIDATE');

process.stdout.write(`${JSON.stringify(createCalibrationShard(
  baseline,
  calibration,
  candidate,
  replicateStart,
  replicateCount,
  calibrationImplementationDigest(packageRoot),
))}\n`);
