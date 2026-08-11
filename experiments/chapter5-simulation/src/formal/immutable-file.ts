import { existsSync, linkSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

let temporaryFileOrdinal = 0;

export function publishImmutableText(
  path: string,
  serialized: string,
  conflictErrorCode: string,
): boolean {
  if (existsSync(path)) {
    if (readFileSync(path, 'utf8') !== serialized) throw new Error(conflictErrorCode);
    return false;
  }
  temporaryFileOrdinal += 1;
  const temporaryPath = `${path}.partial-${process.pid}-${temporaryFileOrdinal}`;
  writeFileSync(temporaryPath, serialized, { flag: 'wx' });
  try {
    linkSync(temporaryPath, path);
  } catch (error) {
    rmSync(temporaryPath, { force: true });
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    if (readFileSync(path, 'utf8') !== serialized) throw new Error(conflictErrorCode);
    return false;
  }
  rmSync(temporaryPath, { force: true });
  return true;
}
