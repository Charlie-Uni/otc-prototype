import { createHash } from 'node:crypto';

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(record).sort().map((key) => [key, canonicalize(record[key])]),
    );
  }
  if (typeof value === 'bigint') return value.toString();
  return value;
}

export function semanticDigestSha256(value: unknown): string {
  const bytes = JSON.stringify(canonicalize(value));
  return createHash('sha256').update(bytes).digest('hex');
}
