import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { semanticDigestSha256 } from '../src/runner/digest';

function sourceFiles(root: string, directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(root, path);
    if (!entry.isFile() || !entry.name.endsWith('.ts') || entry.name.endsWith('.test.ts')) return [];
    return [relative(root, path)];
  });
}

function fileSha256(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

export function calibrationImplementationDigest(packageRoot: string): string {
  const paths = [
    ...sourceFiles(packageRoot, resolve(packageRoot, 'src')),
    'scripts/calibration-provenance.ts',
    'scripts/run-pilot-calibration-shard.ts',
    'scripts/run-pilot-calibration.ts',
  ].sort();
  return semanticDigestSha256(Object.fromEntries(paths.map((path) => [
    path,
    fileSha256(resolve(packageRoot, path)),
  ])));
}
