import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateRunSummary } from './run-summary-validator.mjs';

function validSummary() {
  return {
    schemaVersion: 1,
    preregistration: {
      tag: 'paper85-prereg-v1',
      commitSha: '1'.repeat(40),
      manifestSha256: '2'.repeat(64),
    },
    sourceArtifact: {
      tag: 'chapter3-artifact-v1.4.0',
      commitSha: 'e5b1e126e5e7ff37f5fe47307d945447724a17d1',
      evidenceAnchor: 'b5fe1c8ec2153d1e84e0492012be44a45182dfe2',
    },
    run: {
      runId: 'test-run',
      startedAt: '2026-08-08T00:00:00.000Z',
      chainId: 31_337,
      genesisTimestamp: 1_710_000_000,
      toolchain: {},
    },
    counts: {},
    metrics: {},
    evidenceManifestSha256: '3'.repeat(64),
  };
}

test('accepts a run summary conforming to the sealed schema', () => {
  assert.equal(validateRunSummary(validSummary()).schemaVersion, 1);
});

test('rejects unregistered evidence fields at the summary root', () => {
  assert.throws(
    () => validateRunSummary({ ...validSummary(), researcherOverride: true }),
    /unexpected keys/,
  );
});

test('rejects a different source artifact anchor', () => {
  const summary = validSummary();
  summary.sourceArtifact.commitSha = '4'.repeat(40);
  assert.throws(() => validateRunSummary(summary), /unexpected source artifact commit/);
});
