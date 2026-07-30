function lifecycleValueError(field: string): Error {
  return new Error(`INVALID_LIFECYCLE_${field.toUpperCase()}`);
}

export function lifecycleBigInt(payload: Record<string, unknown>, field: string): bigint {
  const value = payload[field];
  if (typeof value === 'bigint' && value >= 0n) return value;
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) {
    return BigInt(value);
  }
  if (typeof value === 'string' && /^(0|[1-9][0-9]*)$/.test(value)) {
    return BigInt(value);
  }
  throw lifecycleValueError(field);
}

export function lifecycleTimestamp(payload: Record<string, unknown>, field: string): number {
  const value = lifecycleBigInt(payload, field);
  const normalized = Number(value);
  if (!Number.isSafeInteger(normalized)) throw lifecycleValueError(field);
  return normalized;
}

export function lifecycleString(payload: Record<string, unknown>, field: string): string {
  const value = payload[field];
  if (typeof value !== 'string' || value.length === 0) throw lifecycleValueError(field);
  return value;
}

export function sameFundId(left: `0x${string}`, right: `0x${string}`): boolean {
  return left.toLowerCase() === right.toLowerCase();
}
