// Run isolation, source/build binding and append-only transaction evidence.
// This module has no dependency on the experiment runners or replay engine.
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { appendFile, mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { cpus, platform, release, totalmem } from 'node:os';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
export const RUN_DIR = process.env.PAPER85_RUN_DIR;
const encode = (v) => JSON.stringify(v, (_, x) => typeof x === 'bigint' ? x.toString() : x);
export const digest = (v) => createHash('sha256').update(v).digest('hex');
const git = (root, ...args) => execFileSync('git', args, { cwd: root }).toString().trim();
export const GOVERNED_INPUTS = Object.freeze(['experiments/paper85-evaluation/scripts', 'experiments/paper85-evaluation/spec',
  'experiments/paper85-evaluation/spec-v3', 'experiments/paper85-evaluation/baselines/src',
  'experiments/paper85-evaluation/baselines/foundry.toml', 'contracts/src', 'contracts/foundry.toml',
  'apps/api/package.json', 'apps/api/pnpm-lock.yaml', 'pnpm-lock.yaml', 'package.json']);

async function sourceFiles(root) {
  const paths = git(root, 'ls-files', '--cached', '--others', '--exclude-standard', '--', ...GOVERNED_INPUTS)
    .split('\n').filter(Boolean).sort();
  const files = {};
  for (const path of paths) files[path] = digest(await readFile(resolve(root, path)));
  return files;
}

function checkFrozenInputs(root, files, productionRef, preregistrationRef) {
  for (const path of Object.keys(files).filter((p) => p.startsWith('contracts/src/'))) {
    const frozen = execFileSync('git', ['show', `${productionRef}:${path}`], { cwd: root });
    if (files[path] !== digest(frozen)) throw new Error(`Frozen production source changed: ${path}`);
  }
  for (const name of ['evaluation-plan.v3.md', 'baseline-mapping.v3.json']) {
    const path = `experiments/paper85-evaluation/spec-v3/${name}`;
    const original = execFileSync('git', ['show', `${preregistrationRef}:${path}`], { cwd: root });
    if (files[path] !== digest(original)) throw new Error(`Original preregistration changed: ${path}`);
  }
}

export async function sourceIdentity({ root = ROOT,
  productionRef = 'chapter3-artifact-v1.4.0', preregistrationRef = '4ce5d24' } = {}) {
  const dirty = git(root, 'status', '--porcelain', '--untracked-files=all', '--', ...GOVERNED_INPUTS);
  if (dirty) throw new Error(`Uncommitted governed inputs:\n${dirty}`);
  const files = await sourceFiles(root);
  checkFrozenInputs(root, files, productionRef, preregistrationRef);
  return { commit: git(root, 'rev-parse', 'HEAD'), governedInputsDirty: false, files };
}

// Offline verification binds filesystem bytes without requiring Git history or
// frozen tags. Git metadata is optional provenance, never a prerequisite. New
// measurements still use sourceIdentity() and its strict frozen-input checks.
export async function verificationIdentity({ root = ROOT } = {}) {
  const files = {};
  async function visit(path) {
    const entries = await readdir(resolve(root, path), { withFileTypes: true });
    for (const entry of entries) {
      const child = `${path}/${entry.name}`;
      if (entry.isDirectory()) await visit(child);
      else files[child] = digest(await readFile(resolve(root, child)));
    }
  }
  for (const path of GOVERNED_INPUTS) {
    const info = await stat(resolve(root, path)).catch((error) => {
      if (error.code !== 'ENOENT') throw error;
      return null;
    });
    if (!info) files[path] = null; // Record absent optional manifests as well.
    else if (info.isDirectory()) await visit(path);
    else files[path] = digest(await readFile(resolve(root, path)));
  }
  const sortedFiles = Object.fromEntries(Object.entries(files).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0));
  const head = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' });
  const status = spawnSync('git', ['status', '--porcelain', '--untracked-files=all', '--', ...GOVERNED_INPUTS],
    { cwd: root, encoding: 'utf8' });
  const gitAvailable = head.status === 0 && status.status === 0;
  const baseCommit = gitAvailable ? head.stdout.trim() : null;
  const dirty = gitAvailable ? Boolean(status.stdout.trim()) : null;
  return { commit: gitAvailable && !dirty ? baseCommit : null, baseCommit,
    gitAvailable, governedInputsDirty: dirty,
    sourceSha256: digest(encode(sortedFiles)), files: sortedFiles };
}

export async function save(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const bytes = `${encode(value)}\n`;
  await writeFile(path, path.endsWith('.gz') ? gzipSync(bytes) : bytes, { flag: 'wx' });
}

export async function record(client, value) {
  if (!client.evidencePath) throw new Error('Missing evidencePath; refusing to discard evidence');
  await appendFile(client.evidencePath, `${encode(value)}\n`);
}

export async function recordReceipt(client, receipt, input) {
  const [transaction, block] = await Promise.all([
    client.request({ method: 'eth_getTransactionByHash', params: [receipt.transactionHash] }),
    client.request({ method: 'eth_getBlockByNumber', params: [`0x${receipt.blockNumber.toString(16)}`, false] }),
  ]);
  await record(client, { kind: 'transaction', input, transaction, receipt,
    block: { number: block.number, hash: block.hash, timestamp: block.timestamp } });
}

export function maskImmutables(code, references = {}) {
  const bytes = Buffer.from(code.slice(2), 'hex');
  for (const spans of Object.values(references)) for (const { start, length } of spans) bytes.fill(0, start, start + length);
  return `0x${bytes.toString('hex')}`;
}

export function assertRuntime(code, artifact) {
  if (maskImmutables(code, artifact.immutableReferences) !== maskImmutables(artifact.runtime, artifact.immutableReferences)) {
    throw new Error(`${artifact.name}: deployed runtime differs from verified build`);
  }
}

export async function prepareRun() {
  const identity = await sourceIdentity();
  const dir = resolve(ROOT, 'docs/evidence/paper85/v3-revision', `${new Date().toISOString().replaceAll(':', '-')}-${randomUUID().slice(0, 8)}`);
  await mkdir(dir, { recursive: true });
  const machine = cpus();
  await save(resolve(dir, 'run.json'), { schema: 1, ...identity, startedAt: new Date().toISOString(),
    hardware: { platform: platform(), release: release(), cpu: machine[0].model, logicalCpus: machine.length, memoryBytes: totalmem() },
    node: process.version, chain: { implementation: 'Anvil', hardfork: 'osaka', chainId: 31337, genesisTimestamp: 1710000000, automine: true },
    timingScope: 'Local sequential runs; transaction evidence I/O excluded from measured fetch/replay intervals. No exclusive-host guarantee.' });
  return dir;
}

export async function sealRun(dir) {
  const before = JSON.parse(await readFile(resolve(dir, 'run.json')));
  const after = await sourceIdentity();
  if (encode(before.files) !== encode(after.files) || before.commit !== after.commit) throw new Error('Governed inputs changed during run');
  const files = {};
  async function visit(folder) {
    for (const entry of await readdir(folder, { withFileTypes: true })) {
      const path = resolve(folder, entry.name);
      if (entry.isDirectory()) await visit(path);
      else files[relative(dir, path)] = digest(await readFile(path));
    }
  }
  await visit(dir);
  await save(resolve(dir, 'manifest.json'), { schema: 1, status: 'complete', completedAt: new Date().toISOString(), files });
}
