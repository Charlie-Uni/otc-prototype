const HASH_256 = /^[0-9a-f]{64}$/;
const COMMIT_SHA = /^[0-9a-f]{40}$/;
const ROOT_KEYS = ['counts', 'evidenceManifestSha256', 'metrics', 'preregistration', 'run', 'schemaVersion', 'sourceArtifact'];

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function exactKeys(value, expected, label) {
  invariant(value !== null && typeof value === 'object' && !Array.isArray(value), `${label} must be an object`);
  const actual = Object.keys(value).sort();
  invariant(JSON.stringify(actual) === JSON.stringify([...expected].sort()), `${label} has unexpected keys: ${actual.join(',')}`);
}

export function validateRunSummary(summary) {
  exactKeys(summary, ROOT_KEYS, 'run summary');
  invariant(summary.schemaVersion === 1, 'run summary schemaVersion must be 1');

  exactKeys(summary.preregistration, ['tag', 'commitSha', 'manifestSha256'], 'preregistration');
  invariant(summary.preregistration.tag === 'paper85-prereg-v1', 'unexpected preregistration tag');
  invariant(COMMIT_SHA.test(summary.preregistration.commitSha), 'invalid preregistration commit SHA');
  invariant(HASH_256.test(summary.preregistration.manifestSha256), 'invalid preregistration manifest hash');

  exactKeys(summary.sourceArtifact, ['tag', 'commitSha', 'evidenceAnchor'], 'sourceArtifact');
  invariant(summary.sourceArtifact.tag === 'chapter3-artifact-v1.4.0', 'unexpected source artifact tag');
  invariant(summary.sourceArtifact.commitSha === 'e5b1e126e5e7ff37f5fe47307d945447724a17d1', 'unexpected source artifact commit');
  invariant(summary.sourceArtifact.evidenceAnchor === 'b5fe1c8ec2153d1e84e0492012be44a45182dfe2', 'unexpected source evidence anchor');

  invariant(summary.run !== null && typeof summary.run === 'object' && !Array.isArray(summary.run), 'run must be an object');
  invariant(typeof summary.run.runId === 'string' && summary.run.runId.length > 0, 'runId must be non-empty');
  invariant(typeof summary.run.startedAt === 'string' && summary.run.startedAt.length > 0, 'startedAt must be non-empty');
  invariant(summary.run.chainId === 31_337, 'run chainId must be 31337');
  invariant(summary.run.genesisTimestamp === 1_710_000_000, 'run genesisTimestamp must be 1710000000');
  invariant(summary.run.toolchain !== null && typeof summary.run.toolchain === 'object', 'run toolchain must be an object');

  invariant(summary.counts !== null && typeof summary.counts === 'object' && !Array.isArray(summary.counts), 'counts must be an object');
  invariant(summary.metrics !== null && typeof summary.metrics === 'object' && !Array.isArray(summary.metrics), 'metrics must be an object');
  invariant(HASH_256.test(summary.evidenceManifestSha256), 'invalid evidence manifest hash');
  return summary;
}
