import type {
  FundNetStabilityBenefit,
  StabilityComponent,
} from './outcome-types';

export function fundNetStabilityBenefit(
  components: readonly StabilityComponent[],
): FundNetStabilityBenefit {
  if (components.length === 0) throw new Error('EMPTY_STABILITY_COMPONENTS');
  const ids = new Set<string>();
  for (const component of components) {
    if (!component.componentId.trim()) throw new Error('INVALID_STABILITY_COMPONENT_ID');
    if (ids.has(component.componentId)) throw new Error('DUPLICATE_STABILITY_COMPONENT_ID');
    ids.add(component.componentId);
    if (!Number.isSafeInteger(component.benefitBps)) {
      throw new Error('INVALID_STABILITY_COMPONENT_BENEFIT_BPS');
    }
    if (
      !Number.isInteger(component.weightBps)
      || component.weightBps < 0
      || component.weightBps > 10_000
    ) throw new Error('INVALID_STABILITY_COMPONENT_WEIGHT_BPS');
  }
  const weightTotal = components.reduce((sum, component) => sum + component.weightBps, 0);
  if (weightTotal !== 10_000) throw new Error('STABILITY_WEIGHTS_MUST_SUM_10000');
  const weightedBenefit = components.reduce((sum, component) => (
    sum + BigInt(component.benefitBps) * BigInt(component.weightBps)
  ), 0n);
  const valueBps = weightedBenefit / 10_000n;
  if (
    valueBps > BigInt(Number.MAX_SAFE_INTEGER)
    || valueBps < BigInt(Number.MIN_SAFE_INTEGER)
  ) throw new Error('NET_STABILITY_BENEFIT_OVERFLOW');
  return {
    valueBps: Number(valueBps),
    components: components.map((component) => ({ ...component })),
  };
}
