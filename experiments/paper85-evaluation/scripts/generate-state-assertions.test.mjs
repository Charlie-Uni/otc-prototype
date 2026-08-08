import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(SCRIPT_DIR, '..');
const SCRIPT_PATH = resolve(SCRIPT_DIR, 'generate-state-assertions.mjs');
const SPEC_PATH = resolve(ROOT, 'spec-v2/state-assertions.v2.json');

async function runWithMutation(mutate) {
  const temporaryDirectory = await mkdtemp(resolve(tmpdir(), 'paper85-state-assertions-'));
  const temporarySpec = resolve(temporaryDirectory, 'state-assertions.json');
  const spec = JSON.parse(await readFile(SPEC_PATH));
  mutate(spec);
  await writeFile(temporarySpec, `${JSON.stringify(spec, null, 2)}\n`);
  return spawnSync(process.execPath, [SCRIPT_PATH, '--check', '--spec', temporarySpec], {
    cwd: ROOT,
    encoding: 'utf8',
  });
}

test('rejects a changed transcription of sealed state assertion prose', async () => {
  const result = await runWithMutation((spec) => {
    spec.assertions[13].sourceAssertions[1] = 'M4 balances change';
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /sourceAssertions are not a byte-faithful JSON transcription/);
});

test('rejects an assertion specification with a missing targeted scenario', async () => {
  const result = await runWithMutation((spec) => {
    spec.assertions.pop();
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /does not cover every targeted scenario/);
});

test('rejects type-invalid state comparisons before Solidity generation', async () => {
  const result = await runWithMutation((spec) => {
    spec.assertions[0].checks[0].right = { uint: '0' };
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /operand types differ/);
});
