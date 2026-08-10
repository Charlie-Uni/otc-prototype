import { execFile } from 'node:child_process';
import { availableParallelism } from 'node:os';
import {
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parsePilotCalibrationConfig } from '../src/calibration/config';
import { createCalibrationCandidates } from '../src/calibration/grid';
import {
  assemblePilotCalibrationReport,
  summarizeCalibrationScreening,
} from '../src/calibration/run';
import { parseCalibrationShard } from '../src/calibration/shard';
import type { CalibrationCandidate, CalibrationShard } from '../src/calibration/types';
import { parseSimulationConfig } from '../src/core/config';
import { semanticDigestSha256 } from '../src/runner/digest';
import { calibrationImplementationDigest } from './calibration-provenance';

type ShardJob = {
  candidate: CalibrationCandidate;
  replicateStart: number;
  replicateCount: number;
};

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const shardScript = resolve(packageRoot, 'scripts/run-pilot-calibration-shard.ts');

function workerCount(): number {
  const value = process.env.CHAPTER5_CALIBRATION_WORKERS;
  const parsed = value === undefined ? Math.min(4, availableParallelism()) : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 16) {
    throw new Error('INVALID_CHAPTER5_CALIBRATION_WORKERS');
  }
  return parsed;
}

function splitJobs(
  candidate: CalibrationCandidate,
  replicateCount: number,
  chunkSize: number,
): ShardJob[] {
  const jobs: ShardJob[] = [];
  for (let replicateStart = 0; replicateStart < replicateCount; replicateStart += chunkSize) {
    jobs.push({
      candidate,
      replicateStart,
      replicateCount: Math.min(chunkSize, replicateCount - replicateStart),
    });
  }
  return jobs;
}

function runChild(job: ShardJob): Promise<CalibrationShard> {
  return new Promise((resolvePromise, reject) => {
    execFile(process.execPath, [
      '--import',
      'tsx',
      shardScript,
      job.candidate.candidateId,
      String(job.replicateStart),
      String(job.replicateCount),
    ], {
      cwd: packageRoot,
      encoding: 'utf8',
      maxBuffer: 50 * 1024 * 1024,
    }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`CALIBRATION_SHARD_FAILED:${stderr || error.message}`));
        return;
      }
      try {
        resolvePromise(parseCalibrationShard(JSON.parse(stdout) as unknown));
      } catch (parseError) {
        reject(parseError);
      }
    });
  });
}

const baseline = parseSimulationConfig(JSON.parse(readFileSync(
  new URL('../config/pilot-baseline.json', import.meta.url),
  'utf8',
)) as unknown);
const calibration = parsePilotCalibrationConfig(JSON.parse(readFileSync(
  new URL('../config/pilot-calibration.json', import.meta.url),
  'utf8',
)) as unknown);

const baselineDigest = semanticDigestSha256(baseline);
const calibrationDigest = semanticDigestSha256(calibration);
const implementationDigest = calibrationImplementationDigest(packageRoot);
const cacheDirectory = resolve(
  packageRoot,
  `results/pilot-calibration-shards/${baselineDigest.slice(0, 12)}-${calibrationDigest.slice(0, 12)}-${implementationDigest.slice(0, 12)}`,
);
mkdirSync(cacheDirectory, { recursive: true });

function cachePath(job: ShardJob): string {
  return resolve(
    cacheDirectory,
    `${job.candidate.candidateId}-r${job.replicateStart}-n${job.replicateCount}.json`,
  );
}

function validateShardForJob(shard: CalibrationShard, job: ShardJob): CalibrationShard {
  const expectedThresholdKeys = calibration.detectionThresholdCalibration.candidatesBps
    .map(String)
    .sort();
  if (
    shard.baselineConfigDigestSha256 !== baselineDigest
    || shard.calibrationConfigDigestSha256 !== calibrationDigest
    || shard.implementationDigestSha256 !== implementationDigest
    || shard.candidate.candidateId !== job.candidate.candidateId
    || semanticDigestSha256(shard.candidate) !== semanticDigestSha256(job.candidate)
    || shard.replicateStart !== job.replicateStart
    || shard.replicateCount !== job.replicateCount
    || shard.windowDays !== calibration.windowDays
    || shard.observations.some((observation) => {
      const actualKeys = Object.keys(
        observation.regulatorDetectionLagSecByThresholdBps,
      ).sort();
      return actualKeys.length !== expectedThresholdKeys.length
        || actualKeys.some((key, index) => key !== expectedThresholdKeys[index]);
    })
  ) throw new Error('CALIBRATION_SHARD_JOB_MISMATCH');
  return shard;
}

async function executeJob(job: ShardJob): Promise<CalibrationShard> {
  const path = cachePath(job);
  try {
    const cached = parseCalibrationShard(JSON.parse(readFileSync(path, 'utf8')) as unknown);
    process.stderr.write(`reused ${path}\n`);
    return validateShardForJob(cached, job);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  const shard = validateShardForJob(await runChild(job), job);
  const temporaryPath = `${path}.tmp-${process.pid}`;
  writeFileSync(temporaryPath, `${JSON.stringify(shard, null, 2)}\n`);
  renameSync(temporaryPath, path);
  process.stderr.write(`completed ${path}\n`);
  return shard;
}

async function executeJobs(jobs: readonly ShardJob[]): Promise<CalibrationShard[]> {
  const results = new Array<CalibrationShard>(jobs.length);
  let nextIndex = 0;
  async function worker(): Promise<void> {
    while (nextIndex < jobs.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await executeJob(jobs[index]!);
    }
  }
  await Promise.all(Array.from(
    { length: Math.min(workerCount(), jobs.length) },
    () => worker(),
  ));
  return results;
}

const candidates = createCalibrationCandidates(calibration);
const screeningShards = await executeJobs(candidates.flatMap((candidate) => (
  splitJobs(candidate, calibration.screeningReplicates, 1)
)));
const screeningObservations = screeningShards.flatMap(({ observations }) => observations);
const selected = summarizeCalibrationScreening(
  baseline,
  calibration,
  screeningObservations,
).selected;
const validationShards = selected
  ? await executeJobs(splitJobs(selected, calibration.validationReplicates, 5))
  : [];
const report = assemblePilotCalibrationReport(
  baseline,
  calibration,
  screeningObservations,
  validationShards.flatMap(({ observations }) => observations),
  implementationDigest,
);

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
