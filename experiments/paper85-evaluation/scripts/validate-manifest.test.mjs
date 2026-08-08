import assert from 'node:assert/strict';
import test from 'node:test';

import { loadManifest, validateManifest } from './validate-manifest.mjs';

function clone(value) {
  return structuredClone(value);
}

test('preregistered manifest has 18 valid and 24 exact-rejection scenarios', async () => {
  const { manifest, sha256 } = await loadManifest();
  const summary = validateManifest(manifest);

  assert.deepEqual(summary, {
    total: 42,
    valid: 18,
    invalid: 24,
    predicateCounts: {
      Authorized: 5,
      ComplianceValid: 4,
      NAVValid: 4,
      LifecycleValid: 4,
      ParamConsistent: 7,
    },
    operationCount: 8,
    fixtureCount: 20,
  });
  assert.match(sha256, /^[0-9a-f]{64}$/);
});

test('duplicate scenario ids invalidate preregistration', async () => {
  const { manifest } = await loadManifest();
  const changed = clone(manifest);
  changed.scenarios[1].id = changed.scenarios[0].id;

  assert.throws(() => validateManifest(changed), /scenario ids must be unique/);
});

test('invalid baseline must assert a specific error code', async () => {
  const { manifest } = await loadManifest();
  const changed = clone(manifest);
  delete changed.scenarios.find(({ id }) => id === 'I06').baselineExpected.errorCode;

  assert.throws(() => validateManifest(changed), /keys do not match the preregistered shape/);
});

test('ablation variant must match the targeted predicate', async () => {
  const { manifest } = await loadManifest();
  const changed = clone(manifest);
  changed.scenarios.find(({ id }) => id === 'I14').ablationHypothesis.variant = 'M2';

  assert.throws(() => validateManifest(changed), /does not match target predicate/);
});

test('a residual rejection must preregister its exact error', async () => {
  const { manifest } = await loadManifest();
  const changed = clone(manifest);
  delete changed.scenarios.find(({ id }) => id === 'I10').ablationHypothesis.expectedError;

  assert.throws(() => validateManifest(changed), /keys do not match the preregistered shape/);
});

for (const field of ['actual', 'verdict', 'result']) {
  test(`runtime field ${field} cannot contaminate the preregistered manifest`, async () => {
    const { manifest } = await loadManifest();
    const changed = clone(manifest);
    changed.scenarios[0][field] = 'observed-after-run';

    assert.throws(() => validateManifest(changed), /keys do not match the preregistered shape/);
  });
}

test('error kind is restricted to the preregistered enum', async () => {
  const { manifest } = await loadManifest();
  const changed = clone(manifest);
  changed.scenarios.find(({ id }) => id === 'I01').baselineExpected.errorKind = 'anything';

  assert.throws(() => validateManifest(changed), /invalid error kind/);
});

test('fixture times must be strictly increasing across inheritance', async () => {
  const { manifest } = await loadManifest();
  const changed = clone(manifest);
  changed.fixtures.eligible.steps[0].atSec = 40;

  assert.throws(() => validateManifest(changed), /step times must be strictly increasing/);
});

test('structured calls reject undeclared arguments', async () => {
  const { manifest } = await loadManifest();
  const changed = clone(manifest);
  changed.scenarios.find(({ id }) => id === 'V14').action.args.hidden = true;

  assert.throws(() => validateManifest(changed), /args keys do not match the preregistered shape/);
});

test('constant references must resolve inside the manifest', async () => {
  const { manifest } = await loadManifest();
  const changed = clone(manifest);
  changed.scenarios.find(({ id }) => id === 'V03').action.args.initialNav = '$missing';

  assert.throws(() => validateManifest(changed), /unknown constant reference/);
});

test('structured actor arguments must resolve to fixed actor labels', async () => {
  const { manifest } = await loadManifest();
  const changed = clone(manifest);
  changed.scenarios.find(({ id }) => id === 'V01').action.args.investor = 'unknown-investor';

  assert.throws(() => validateManifest(changed), /unknown actor/);
});

test('I05 preregisters unauthorized role mutation for M1', async () => {
  const { manifest } = await loadManifest();
  const scenario = manifest.scenarios.find(({ id }) => id === 'I05');

  assert.equal(scenario.operation, 'updateRole');
  assert.equal(scenario.action.call, 'grantRole');
  assert.equal(scenario.baselineExpected.errorCode, 'AccessControlUnauthorizedAccount');
  assert.deepEqual(scenario.baselineExpected.errorArgs, ['stranger', 'DEFAULT_ADMIN_ROLE']);
});
