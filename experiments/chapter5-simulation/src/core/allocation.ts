export function allocateIntegerProportionally(total: number, weights: readonly number[]): number[] {
  if (!Number.isSafeInteger(total) || total < 0) throw new Error('INVALID_ALLOCATION_TOTAL');
  if (weights.length === 0) throw new Error('EMPTY_ALLOCATION_WEIGHTS');
  if (weights.some((weight) => !Number.isSafeInteger(weight) || weight < 0)) {
    throw new Error('INVALID_ALLOCATION_WEIGHT');
  }
  const totalWeight = weights.reduce((sum, weight) => sum + BigInt(weight), 0n);
  if (totalWeight === 0n) throw new Error('ZERO_ALLOCATION_WEIGHT');

  const totalValue = BigInt(total);
  const allocations = weights.map((weight) => Number((totalValue * BigInt(weight)) / totalWeight));
  const remainders = weights.map((weight, index) => ({
    index,
    remainder: (totalValue * BigInt(weight)) % totalWeight,
  }));
  const undistributed = total - allocations.reduce((sum, value) => sum + value, 0);
  remainders.sort((left, right) => (
    left.remainder === right.remainder
      ? left.index - right.index
      : left.remainder > right.remainder ? -1 : 1
  ));
  for (let index = 0; index < undistributed; index += 1) {
    allocations[remainders[index]!.index] += 1;
  }
  return allocations;
}
