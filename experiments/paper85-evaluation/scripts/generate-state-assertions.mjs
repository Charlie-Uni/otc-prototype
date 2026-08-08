import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(SCRIPT_DIR, '..');
const MANIFEST_PATH = resolve(ROOT, 'spec/scenarios.v1.json');
function argument(name, fallback) {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : resolve(process.cwd(), process.argv[index + 1]);
}

const SPEC_PATH = argument('--spec', resolve(ROOT, 'spec-v2/state-assertions.v2.json'));
const OUTPUT_PATH = argument('--output', resolve(ROOT, 'contracts/test/AblationStateAssertions.sol'));

const STATE_FIELD_TYPES = new Map([
  ['totalSupply', 'uint'],
  ['subscriptionRequestCount', 'uint'],
  ['redemptionRequestCount', 'uint'],
  ['totalQueuedRedemption', 'uint'],
  ['aliceBalance', 'uint'],
  ['bobBalance', 'uint'],
  ['aliceQueued', 'uint'],
  ['bobQueued', 'uint'],
  ['aliceWhitelisted', 'bool'],
  ['bobWhitelisted', 'bool'],
  ['operator2SubscriptionRole', 'bool'],
  ['paused', 'bool'],
  ['navHistoryLength', 'uint'],
  ['latestNavAsOf', 'uint'],
  ['latestNavIsInitial', 'bool'],
  ['subscription0Amount', 'uint'],
  ['subscription0Accepted', 'bool'],
  ['subscription0MintedShares', 'uint'],
  ['redemption0Settled', 'bool'],
]);

const DIGEST_FIELDS = new Set([
  'baselineBeforeStateDigest',
  'baselineStateDigest',
  'ablatedBeforeStateDigest',
  'ablatedStateDigest',
]);

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function hasExactKeys(value, keys, label) {
  invariant(value !== null && typeof value === 'object' && !Array.isArray(value), `${label} must be an object`);
  invariant(
    JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort()),
    `${label} has an unexpected shape`,
  );
}

function fieldType(field, label) {
  if (DIGEST_FIELDS.has(field)) return 'bytes32';
  const match = /^(baseline|ablated)\.([A-Za-z0-9]+)$/.exec(field);
  invariant(match, `${label}: invalid field ${field}`);
  const type = STATE_FIELD_TYPES.get(match[2]);
  invariant(type, `${label}: unknown state field ${field}`);
  return type;
}

function validateOperand(operand, label) {
  invariant(operand !== null && typeof operand === 'object' && !Array.isArray(operand), `${label} must be an operand`);
  const keys = Object.keys(operand);
  invariant(keys.length === 1, `${label} must contain exactly one operand kind`);
  if (keys[0] === 'field') {
    invariant(typeof operand.field === 'string', `${label}.field must be a string`);
    return fieldType(operand.field, label);
  }
  if (keys[0] === 'uint') {
    invariant(/^(0|[1-9][0-9]*)$/.test(operand.uint), `${label}.uint must be an unsigned decimal string`);
    return 'uint';
  }
  if (keys[0] === 'bool') {
    invariant(typeof operand.bool === 'boolean', `${label}.bool must be boolean`);
    return 'bool';
  }
  if (keys[0] === 'add') {
    invariant(Array.isArray(operand.add) && operand.add.length === 2, `${label}.add must have two operands`);
    invariant(validateOperand(operand.add[0], `${label}.add[0]`) === 'uint', `${label}.add[0] must be uint`);
    invariant(validateOperand(operand.add[1], `${label}.add[1]`) === 'uint', `${label}.add[1] must be uint`);
    return 'uint';
  }
  throw new Error(`${label}: unsupported operand ${keys[0]}`);
}

function validateCheck(check, label) {
  hasExactKeys(check, ['left', 'op', 'right'], label);
  invariant(['eq', 'neq', 'gt', 'lt'].includes(check.op), `${label}: unsupported operator ${check.op}`);
  const leftType = validateOperand(check.left, `${label}.left`);
  const rightType = validateOperand(check.right, `${label}.right`);
  invariant(leftType === rightType, `${label}: operand types differ`);
  if (check.op === 'gt' || check.op === 'lt') invariant(leftType === 'uint', `${label}: ordered comparison requires uint`);
}

function renderOperand(operand) {
  if (Object.hasOwn(operand, 'field')) return operand.field;
  if (Object.hasOwn(operand, 'uint')) return operand.uint;
  if (Object.hasOwn(operand, 'bool')) return String(operand.bool);
  return `(${renderOperand(operand.add[0])} + ${renderOperand(operand.add[1])})`;
}

function renderCheck(check) {
  const operator = { eq: '==', neq: '!=', gt: '>', lt: '<' }[check.op];
  return `${renderOperand(check.left)} ${operator} ${renderOperand(check.right)}`;
}

function formatSolidity(source) {
  const result = spawnSync('forge', ['fmt', '--raw', '-'], {
    cwd: resolve(ROOT, 'contracts'),
    input: source,
    encoding: 'utf8',
  });
  if (result.status !== 0) throw new Error(`forge fmt failed: ${result.stderr || result.stdout}`);
  return result.stdout;
}

const manifestBytes = await readFile(MANIFEST_PATH);
const specBytes = await readFile(SPEC_PATH);
const manifestHash = sha256(manifestBytes);
const specHash = sha256(specBytes);
const manifest = JSON.parse(manifestBytes);
const spec = JSON.parse(specBytes);

hasExactKeys(spec, ['schemaVersion', 'kind', 'sourceManifest', 'assertions'], 'state assertion spec');
invariant(spec.schemaVersion === 2, 'state assertion spec: unsupported schema version');
invariant(spec.kind === 'paper85-typed-state-assertions', 'state assertion spec: unexpected kind');
hasExactKeys(spec.sourceManifest, ['path', 'sha256'], 'sourceManifest');
invariant(
  spec.sourceManifest.path === 'experiments/paper85-evaluation/spec/scenarios.v1.json',
  'sourceManifest.path is not the sealed scenario manifest',
);
invariant(spec.sourceManifest.sha256 === manifestHash, 'sourceManifest.sha256 does not match the sealed manifest');
invariant(Array.isArray(spec.assertions), 'state assertion spec: assertions must be an array');

const targetedScenarios = manifest.scenarios.filter(
  (scenario) => scenario.class === 'invalid' && /^M[1-5]$/.test(scenario.ablationHypothesis.variant),
);
invariant(spec.assertions.length === targetedScenarios.length, 'state assertion spec does not cover every targeted scenario');

for (let index = 0; index < targetedScenarios.length; index += 1) {
  const scenario = targetedScenarios[index];
  const assertion = spec.assertions[index];
  hasExactKeys(assertion, ['scenarioId', 'sourceAssertions', 'checks'], `assertions[${index}]`);
  invariant(assertion.scenarioId === scenario.id, `${scenario.id}: assertion order or scenario id differs from manifest`);
  invariant(
    JSON.stringify(assertion.sourceAssertions) === JSON.stringify(scenario.stateAssertions),
    `${scenario.id}: sourceAssertions are not a byte-faithful JSON transcription`,
  );
  invariant(Array.isArray(assertion.checks) && assertion.checks.length > 0, `${scenario.id}: checks are required`);
  assertion.checks.forEach((check, checkIndex) => validateCheck(check, `${scenario.id}.checks[${checkIndex}]`));
}

const branches = spec.assertions.map((assertion, index) => {
  const condition = assertion.checks.map(renderCheck).join('\n                && ');
  const prefix = index === 0 ? 'if' : 'else if';
  return `        ${prefix} (scenarioId == bytes32("${assertion.scenarioId}")) {\n            matches = ${condition};\n        }`;
}).join(' ');

const output = formatSolidity(`// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

// Generated from the sealed scenario prose through state-assertions.v2.json.
// Source manifest SHA-256: ${manifestHash}
// Typed assertion spec SHA-256: ${specHash}

import {StateObservation} from "./M0DifferentialHarness.sol";

library AblationStateAssertions {
    error StateAssertionFailed(bytes32 scenarioId);
    error UnknownTargetScenario(bytes32 scenarioId);

    function verify(
        bytes32 scenarioId,
        StateObservation memory baseline,
        StateObservation memory ablated,
        bytes32 baselineBeforeStateDigest,
        bytes32 baselineStateDigest,
        bytes32 ablatedBeforeStateDigest,
        bytes32 ablatedStateDigest
    ) internal pure {
        bool matches;
${branches} else {
            revert UnknownTargetScenario(scenarioId);
        }

        if (!matches) revert StateAssertionFailed(scenarioId);
    }
}
`);

const mode = process.argv.includes('--write') ? '--write' : '--check';
if (mode === '--write') {
  await writeFile(OUTPUT_PATH, output);
} else if (mode === '--check') {
  const existing = await readFile(OUTPUT_PATH, 'utf8');
  invariant(existing === output, 'AblationStateAssertions.sol is stale');
} else {
  throw new Error(`unknown mode ${mode}`);
}

process.stdout.write(`${JSON.stringify({
  status: mode === '--write' ? 'generated' : 'verified',
  assertions: spec.assertions.length,
  checks: spec.assertions.reduce((sum, assertion) => sum + assertion.checks.length, 0),
  manifestSha256: manifestHash,
  stateAssertionSpecSha256: specHash,
})}\n`);
