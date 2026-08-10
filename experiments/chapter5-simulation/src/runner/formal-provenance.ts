import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const FORMAL_PREREGISTRATION_TAG = 'chapter5-sim-prereg-v1';
const PREREG_LOCK_PATH = 'experiments/chapter5-simulation/spec/formal-prereg-lock.json';

export type FormalExecutionAuthorization = {
  preregistrationTag: typeof FORMAL_PREREGISTRATION_TAG;
  preregistrationCommit: string;
  executionCommit: string;
  preregistrationLockSha256: string;
};

export function assertFormalWorktreeClean(status: string): void {
  if (status.trim()) throw new Error('FORMAL_EXECUTION_WORKTREE_DIRTY');
}

function sha256(value: Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

export function assertFormalExecutionAuthorized(): FormalExecutionAuthorization {
  const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
  const repositoryRoot = resolve(packageRoot, '../..');
  const git = (args: string[]) => execFileSync('git', args, { cwd: repositoryRoot });
  let preregistrationCommit: string;
  try {
    preregistrationCommit = git([
      'rev-parse', `${FORMAL_PREREGISTRATION_TAG}^{commit}`,
    ]).toString('utf8').trim();
  } catch {
    throw new Error('FORMAL_PREREGISTRATION_TAG_MISSING');
  }
  const executionCommit = git(['rev-parse', 'HEAD']).toString('utf8').trim();
  assertFormalWorktreeClean(git([
    'status', '--porcelain=v1', '--untracked-files=all', '--',
    'experiments/chapter5-simulation',
  ]).toString('utf8'));
  const ancestry = spawnSync(
    'git',
    ['merge-base', '--is-ancestor', preregistrationCommit, executionCommit],
    { cwd: repositoryRoot },
  );
  if (ancestry.status !== 0) throw new Error('FORMAL_EXECUTION_NOT_DESCENDED_FROM_PREREGISTRATION');

  const currentLock = readFileSync(resolve(repositoryRoot, PREREG_LOCK_PATH));
  const taggedLock = git(['show', `${FORMAL_PREREGISTRATION_TAG}:${PREREG_LOCK_PATH}`]);
  if (!currentLock.equals(taggedLock)) throw new Error('FORMAL_PREREGISTRATION_LOCK_DRIFT');
  const lockCheck = spawnSync(
    process.execPath,
    ['scripts/preregistration-lock.mjs', '--check'],
    { cwd: packageRoot, encoding: 'utf8' },
  );
  if (lockCheck.status !== 0) throw new Error('FORMAL_PREREGISTRATION_LOCK_CHECK_FAILED');
  return {
    preregistrationTag: FORMAL_PREREGISTRATION_TAG,
    preregistrationCommit,
    executionCommit,
    preregistrationLockSha256: sha256(currentLock),
  };
}
