export function causalObservationTime(
  accessedAt: number,
  causalBounds: readonly (number | null | undefined)[] = [],
): number {
  const times = [accessedAt, ...causalBounds.filter((value): value is number => value !== null && value !== undefined)];
  if (times.some((value) => !Number.isSafeInteger(value) || value < 0)) {
    throw new Error('INVALID_OBSERVATION_TIME');
  }
  return Math.max(...times);
}
