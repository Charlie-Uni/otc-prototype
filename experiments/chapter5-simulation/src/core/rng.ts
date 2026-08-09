import { createHash } from 'node:crypto';

const UINT64_MASK = (1n << 64n) - 1n;
const UINT53_DENOMINATOR = 2 ** 53;

export type RandomDrawKey = {
  masterSeed: bigint;
  replicateId: number;
  entityId: string;
  moduleId: string;
  tick: number;
  drawPurpose: string;
};

function requireNonNegativeSafeInteger(value: number, field: string): void {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`INVALID_${field}`);
}

function requireLabel(value: string, field: string): void {
  if (!value.trim() || value.includes('\u0000')) throw new Error(`INVALID_${field}`);
}

function splitMix64(input: bigint): bigint {
  let value = (input + 0x9e3779b97f4a7c15n) & UINT64_MASK;
  value = ((value ^ (value >> 30n)) * 0xbf58476d1ce4e5b9n) & UINT64_MASK;
  value = ((value ^ (value >> 27n)) * 0x94d049bb133111ebn) & UINT64_MASK;
  return (value ^ (value >> 31n)) & UINT64_MASK;
}

function seedFor(key: RandomDrawKey): bigint {
  if (key.masterSeed < 0n) throw new Error('INVALID_MASTER_SEED');
  requireNonNegativeSafeInteger(key.replicateId, 'REPLICATE_ID');
  requireNonNegativeSafeInteger(key.tick, 'TICK');
  requireLabel(key.entityId, 'ENTITY_ID');
  requireLabel(key.moduleId, 'MODULE_ID');
  requireLabel(key.drawPurpose, 'DRAW_PURPOSE');

  const serialized = [
    key.masterSeed.toString(16),
    String(key.replicateId),
    key.entityId,
    key.moduleId,
    String(key.tick),
    key.drawPurpose,
  ].join('\u0000');
  return createHash('sha256').update(serialized).digest().readBigUInt64BE(0);
}

export function randomUint64(key: RandomDrawKey, ordinal = 0): bigint {
  requireNonNegativeSafeInteger(ordinal, 'DRAW_ORDINAL');
  return splitMix64((seedFor(key) + BigInt(ordinal)) & UINT64_MASK);
}

export function randomUnitInterval(key: RandomDrawKey, ordinal = 0): number {
  const value = randomUint64(key, ordinal) >> 11n;
  return Number(value) / UINT53_DENOMINATOR;
}
