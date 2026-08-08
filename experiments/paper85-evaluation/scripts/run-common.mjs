import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
export const ROOT = resolve(SCRIPT_DIR, '..');
export const REPO_ROOT = resolve(ROOT, '..', '..');
export const CONTRACT_ROOT = resolve(ROOT, 'contracts');
export const MANIFEST_PATH = resolve(ROOT, 'spec/scenarios.v1.json');
export const EXPECTED_MANIFEST_HASH = '97eabdaab3de5cc4d3cb41bbce1b82e445edfa7c8ea060618dc7b51fa5be4c69';

export function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

export function command(commandName, args, options = {}) {
  const result = spawnSync(commandName, args, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    maxBuffer: 128 * 1024 * 1024,
    ...options,
  });
  if (result.status !== 0) {
    throw new Error(`${commandName} ${args.join(' ')} failed:\n${result.stderr || result.stdout}`);
  }
  return result.stdout.trim();
}

export function decodedMap(result, prefix) {
  return new Map(
    result.decoded_logs
      .filter((line) => line.startsWith(prefix))
      .map((line) => {
        const separator = line.indexOf('=');
        return [line.slice(0, separator), line.slice(separator + 1)];
      }),
  );
}

export function countBy(items, key) {
  return Object.fromEntries(
    [...new Set(items.map((item) => item[key]))]
      .sort()
      .map((value) => [value, items.filter((item) => item[key] === value).length]),
  );
}

export function expectedClassification(scenario, variant) {
  const targeted = scenario.class === 'invalid' && scenario.ablationHypothesis.variant === variant;
  return targeted
    ? scenario.ablationHypothesis.classification
    : scenario.baselineExpected.outcome === 'accept' ? 'expected_accept' : 'expected_reject';
}

export async function createRunContext(kind) {
  const startedAt = new Date().toISOString();
  const runId = `${kind}-${startedAt.replace(/[-:.]/g, '')}`;
  const outputDirectory = resolve(ROOT, 'results', runId);
  await mkdir(resolve(ROOT, 'results'), { recursive: true });
  await mkdir(outputDirectory, { recursive: false });
  return { kind, startedAt, runId, outputDirectory };
}

export async function loadRunInputs() {
  const manifestBytes = await readFile(MANIFEST_PATH);
  const manifestHash = sha256(manifestBytes);
  if (manifestHash !== EXPECTED_MANIFEST_HASH) {
    throw new Error(`manifest hash ${manifestHash} does not match preregistered ${EXPECTED_MANIFEST_HASH}`);
  }

  command('node', [resolve(SCRIPT_DIR, 'generate-experimental-contracts.mjs'), '--check']);
  command('node', [resolve(SCRIPT_DIR, 'generate-m0-tests.mjs'), '--check']);

  return {
    manifest: JSON.parse(manifestBytes),
    manifestHash,
    preregistrationCommit: command('git', ['rev-parse', 'paper85-prereg-v1^{commit}']),
    sourceCommit: command('git', ['rev-parse', 'chapter3-artifact-v1.4.0^{commit}']),
    forgeVersion: command('forge', ['--version']).split('\n')[0],
    repository: {
      headCommit: command('git', ['rev-parse', 'HEAD']),
      branch: command('git', ['branch', '--show-current']),
      dirty: command('git', ['status', '--porcelain']).length > 0,
    },
  };
}

export async function writeEvidence({ outputDirectory, title, metadata, files }) {
  for (const [name, contents] of Object.entries(files)) {
    await writeFile(join(outputDirectory, name), contents);
  }

  const manifestLines = Object.entries(files)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, contents]) => `${sha256(contents)}  ${name}`);
  const evidenceManifest = [
    `# ${title}`,
    ...Object.entries(metadata).map(([key, value]) => `# ${key}=${value}`),
    ...manifestLines,
    '',
  ].join('\n');
  await writeFile(join(outputDirectory, 'evidence-sha256.txt'), evidenceManifest);
  return sha256(evidenceManifest);
}

export async function writeFailure(context, error) {
  let repository = null;
  try {
    repository = {
      headCommit: command('git', ['rev-parse', 'HEAD']),
      branch: command('git', ['branch', '--show-current']),
      dirty: command('git', ['status', '--porcelain']).length > 0,
    };
  } catch {
    // Preserve the original failure even if repository inspection is unavailable.
  }
  const failure = {
    schemaVersion: 1,
    runId: context.runId,
    startedAt: context.startedAt,
    failedAt: new Date().toISOString(),
    repository,
    error: error instanceof Error ? error.message : String(error),
  };
  const contents = `${JSON.stringify(failure, null, 2)}\n`;
  await writeFile(join(context.outputDirectory, 'failure.json'), contents);
  await writeFile(
    join(context.outputDirectory, 'evidence-sha256.txt'),
    `# Paper 8.5 failed run evidence\n${sha256(contents)}  failure.json\n`,
  );
}
