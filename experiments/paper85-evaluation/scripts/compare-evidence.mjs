import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, '..', '..', '..');
const VARIANTS = ['M1', 'M2', 'M3', 'M4', 'M5'];
const M0_FIELDS = ['scenarioId', 'class', 'baselineOutcome', 'status'];
const ABLATION_FIELDS = [
  'variant',
  'scenarioId',
  'class',
  'targetPredicate',
  'targeted',
  'classification',
  'stateDivergence',
  'eventDivergence',
];

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function argument(name, fallback) {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : process.argv[index + 1];
}

function project(row, fields) {
  return Object.fromEntries(fields.map((field) => [field, row[field] ?? null]));
}

function keyed(rows, keyFor, label) {
  const result = new Map();
  for (const row of rows) {
    const key = keyFor(row);
    if (result.has(key)) throw new Error(`${label}: duplicate row ${key}`);
    result.set(key, row);
  }
  return result;
}

async function readJson(path) {
  const bytes = await readFile(path);
  return { bytes, value: JSON.parse(bytes) };
}

async function readJsonLines(path) {
  const bytes = await readFile(path);
  const value = bytes.toString('utf8').trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));
  return { bytes, value };
}

async function loadEvidence(directory) {
  const inputs = {};
  const m0Path = resolve(directory, 'm0-observations.json');
  const m0 = await readJson(m0Path);
  inputs[relative(REPO_ROOT, m0Path)] = sha256(m0.bytes);
  const ablation = [];
  for (const variant of VARIANTS) {
    const path = resolve(directory, `${variant}.jsonl`);
    const rows = await readJsonLines(path);
    inputs[relative(REPO_ROOT, path)] = sha256(rows.bytes);
    ablation.push(...rows.value);
  }
  return { m0: m0.value, ablation, inputs };
}

function compareRows(leftRows, rightRows, fields, keyFor, label) {
  const left = keyed(leftRows, keyFor, `${label}/left`);
  const right = keyed(rightRows, keyFor, `${label}/right`);
  const keys = [...new Set([...left.keys(), ...right.keys()])].sort();
  const mismatches = [];
  for (const key of keys) {
    const leftValue = left.has(key) ? project(left.get(key), fields) : null;
    const rightValue = right.has(key) ? project(right.get(key), fields) : null;
    if (JSON.stringify(leftValue) !== JSON.stringify(rightValue)) {
      mismatches.push({ key, left: leftValue, right: rightValue });
    }
  }
  return { rowsCompared: keys.length, mismatches };
}

const leftDirectory = resolve(REPO_ROOT, argument('--left', 'docs/evidence/paper85/v1'));
const rightDirectory = resolve(REPO_ROOT, argument('--right', 'docs/evidence/paper85/v2'));
const outputPath = resolve(
  REPO_ROOT,
  argument('--output', `docs/evidence/paper85/comparisons/${basename(leftDirectory)}-${basename(rightDirectory)}.json`),
);

const left = await loadEvidence(leftDirectory);
const right = await loadEvidence(rightDirectory);
const m0 = compareRows(left.m0, right.m0, M0_FIELDS, (row) => row.scenarioId, 'M0');
const ablation = compareRows(
  left.ablation,
  right.ablation,
  ABLATION_FIELDS,
  (row) => `${row.variant}/${row.scenarioId}`,
  'ablation',
);
const mismatches = [...m0.mismatches, ...ablation.mismatches];

const result = {
  schemaVersion: 1,
  kind: 'paper85-evidence-common-semantics-comparison',
  left: {
    directory: relative(REPO_ROOT, leftDirectory),
    files: left.inputs,
  },
  right: {
    directory: relative(REPO_ROOT, rightDirectory),
    files: right.inputs,
  },
  comparedFields: {
    m0: M0_FIELDS,
    ablation: ABLATION_FIELDS,
  },
  counts: {
    m0RowsCompared: m0.rowsCompared,
    ablationRowsCompared: ablation.rowsCompared,
    totalRowsCompared: m0.rowsCompared + ablation.rowsCompared,
    mismatches: mismatches.length,
  },
  equivalentOnCommonSemantics: mismatches.length === 0,
  mismatches,
};

if (m0.rowsCompared !== 42 || ablation.rowsCompared !== 210) {
  throw new Error(`unexpected comparison cardinality: M0=${m0.rowsCompared}, ablation=${ablation.rowsCompared}`);
}
if (mismatches.length > 0) throw new Error(`evidence differs on ${mismatches.length} common semantic rows`);

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ output: relative(REPO_ROOT, outputPath), ...result.counts })}\n`);
