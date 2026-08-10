import { MAX_BPS } from '../artifact/risk/calc';
import { spilloverRedemptionBps } from '../metrics/spillover';
import type { SimulationState } from '../state/types';
import {
  fundNetworkProximityBps,
  fundNetworkProximityComponents,
} from './proximity';
import {
  NETWORK_PROPAGATION_SOURCE_KINDS,
  type NetworkModel,
  type NetworkProximityComponents,
  type NetworkPropagationRecord,
} from './types';

const sourceKinds = new Set<string>(NETWORK_PROPAGATION_SOURCE_KINDS);

function requireSafeNonNegative(value: number, field: string): void {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`INVALID_${field}`);
}

function requireBps(value: number, field: string): void {
  if (!Number.isInteger(value) || value < 0 || value > MAX_BPS) {
    throw new Error(`INVALID_${field}`);
  }
}

function validateComponentMask(
  raw: NetworkProximityComponents,
  effective: NetworkProximityComponents,
): void {
  for (const [key, rawValue] of Object.entries(raw)) {
    const effectiveValue = effective[key as keyof NetworkProximityComponents];
    requireBps(rawValue, 'RAW_PROXIMITY_COMPONENT_BPS');
    requireBps(effectiveValue, 'EFFECTIVE_PROXIMITY_COMPONENT_BPS');
    if (effectiveValue !== 0 && effectiveValue !== rawValue) {
      throw new Error('INVALID_PROXIMITY_COMPONENT_MASK');
    }
  }
  const analogyEnabled = effective.commonServiceOrManagerBps
    === raw.commonServiceOrManagerBps
    && effective.valuationMethodSimilarityBps === raw.valuationMethodSimilarityBps;
  const analogyDisabled = effective.commonServiceOrManagerBps === 0
    && effective.valuationMethodSimilarityBps === 0;
  if (!analogyEnabled && !analogyDisabled) throw new Error('PARTIAL_SIGNAL_ANALOGY_MASK');
}

function validateAssetPropagation(
  record: NetworkPropagationRecord,
  state: SimulationState,
): void {
  const sale = state.assetSales.find(({ saleId }) => saleId === record.sourceId);
  if (!sale) throw new Error('UNKNOWN_PROPAGATION_SOURCE_SALE');
  if (
    sale.fundId !== record.sourceFundId
    || sale.occurredAt !== record.sourceAt
    || sale.priceImpactBps !== record.sourceMagnitudeBps
    || sale.assetClassId !== record.assetClassId
  ) {
    throw new Error('PROPAGATION_SOURCE_SALE_MISMATCH');
  }
  if (record.spilloverRedemptionBps !== 0) {
    throw new Error('ASSET_PROPAGATION_HAS_REDEMPTION_SIGNAL');
  }
  if (record.transmissionProximityBps !== record.effectiveComponents.sharedIlliquidAssetBps) {
    throw new Error('ASSET_PROPAGATION_PROXIMITY_MISMATCH');
  }
  if (
    (record.targetAssetValueBefore === null) !== (record.targetAssetValueAfter === null)
  ) {
    throw new Error('INCOMPLETE_PROPAGATION_ASSET_VALUES');
  }
  if (record.targetAssetValueBefore === null) {
    if (record.transmittedLoss !== 0) throw new Error('LOSS_WITHOUT_TARGET_ASSET');
    return;
  }
  requireSafeNonNegative(record.targetAssetValueBefore, 'TARGET_ASSET_VALUE_BEFORE');
  requireSafeNonNegative(record.targetAssetValueAfter!, 'TARGET_ASSET_VALUE_AFTER');
  const expectedLoss = Number(
    BigInt(record.targetAssetValueBefore)
      * BigInt(record.sourceMagnitudeBps)
      * BigInt(record.transmissionBps)
      / BigInt(MAX_BPS)
      / BigInt(MAX_BPS),
  );
  if (
    record.transmittedLoss !== expectedLoss
    || record.targetAssetValueBefore - record.targetAssetValueAfter! !== expectedLoss
  ) {
    throw new Error('PROPAGATED_ASSET_LOSS_MISMATCH');
  }
}

function validateSignalPropagation(record: NetworkPropagationRecord): void {
  if (
    record.assetClassId !== null
    || record.targetAssetValueBefore !== null
    || record.targetAssetValueAfter !== null
    || record.transmittedLoss !== 0
  ) {
    throw new Error('SIGNAL_PROPAGATION_HAS_ASSET_MUTATION');
  }
  const expectedProximity = record.sourceKind === 'redemption_pressure'
    ? record.effectiveComponents.investorOverlapBps
    : record.networkProximityBps;
  if (record.transmissionProximityBps !== expectedProximity) {
    throw new Error('SIGNAL_TRANSMISSION_PROXIMITY_MISMATCH');
  }
  if (record.sourceKind === 'public_control' && record.sourceMagnitudeBps !== MAX_BPS) {
    throw new Error('PUBLIC_CONTROL_SIGNAL_MUST_BE_BINARY');
  }
  const expectedSpillover = spilloverRedemptionBps(
    record.sourceMagnitudeBps,
    record.transmissionProximityBps,
    record.transmissionBps,
  );
  if (record.spilloverRedemptionBps !== expectedSpillover) {
    throw new Error('SPILLOVER_REDEMPTION_MISMATCH');
  }
}

export function validateNetworkPropagations(
  state: SimulationState,
  network: NetworkModel,
): void {
  const fundIds = new Set(network.funds.map(({ id }) => id));
  const propagationIds = new Set<string>();
  const targetsBySource = new Map<string, Set<string>>();
  const sourceIdBySignalSlot = new Map<string, string>();
  for (const record of state.networkPropagations) {
    if (!record.propagationId.trim()) throw new Error('INVALID_NETWORK_PROPAGATION_ID');
    if (propagationIds.has(record.propagationId)) throw new Error('DUPLICATE_NETWORK_PROPAGATION');
    propagationIds.add(record.propagationId);
    if (!sourceKinds.has(record.sourceKind)) throw new Error('INVALID_NETWORK_PROPAGATION_KIND');
    if (!record.sourceId.trim()) throw new Error('INVALID_NETWORK_PROPAGATION_SOURCE_ID');
    if (!fundIds.has(record.sourceFundId)) throw new Error('UNKNOWN_PROPAGATION_SOURCE_FUND');
    if (!fundIds.has(record.targetFundId)) throw new Error('UNKNOWN_PROPAGATION_TARGET_FUND');
    if (record.sourceFundId === record.targetFundId) throw new Error('SELF_NETWORK_PROPAGATION');
    requireSafeNonNegative(record.replicateId, 'PROPAGATION_REPLICATE_ID');
    requireSafeNonNegative(record.tick, 'PROPAGATION_TICK');
    requireSafeNonNegative(record.sourceAt, 'PROPAGATION_SOURCE_TIME');
    requireSafeNonNegative(record.propagatedAt, 'PROPAGATED_AT');
    if (record.sourceAt > record.propagatedAt || record.propagatedAt > state.nowSec) {
      throw new Error('INVALID_NETWORK_PROPAGATION_TIME');
    }
    requireBps(record.sourceMagnitudeBps, 'PROPAGATION_SOURCE_MAGNITUDE_BPS');
    requireBps(record.transmissionBps, 'PROPAGATION_TRANSMISSION_BPS');
    requireBps(record.transmissionProximityBps, 'TRANSMISSION_PROXIMITY_BPS');
    requireBps(record.networkProximityBps, 'NETWORK_PROXIMITY_BPS');
    requireBps(record.spilloverRedemptionBps, 'SPILLOVER_REDEMPTION_BPS');
    requireSafeNonNegative(record.transmittedLoss, 'TRANSMITTED_LOSS');
    const expectedRaw = fundNetworkProximityComponents(
      network,
      record.sourceFundId,
      record.targetFundId,
    );
    if (JSON.stringify(record.rawComponents) !== JSON.stringify(expectedRaw)) {
      throw new Error('RAW_NETWORK_PROXIMITY_MISMATCH');
    }
    validateComponentMask(record.rawComponents, record.effectiveComponents);
    if (record.proximityWeightsBps.reduce((sum, weight) => sum + weight, 0) !== MAX_BPS) {
      throw new Error('PROXIMITY_WEIGHTS_MUST_SUM_10000');
    }
    const expectedProximity = fundNetworkProximityBps(
      record.effectiveComponents,
      record.proximityWeightsBps,
    );
    if (record.networkProximityBps !== expectedProximity) {
      throw new Error('NETWORK_PROXIMITY_MISMATCH');
    }
    if (record.sourceKind === 'asset_sale') validateAssetPropagation(record, state);
    else {
      validateSignalPropagation(record);
      const slot = `${record.sourceKind}\u0000${record.sourceFundId}\u0000${record.tick}`;
      const sourceId = sourceIdBySignalSlot.get(slot);
      if (sourceId !== undefined && sourceId !== record.sourceId) {
        throw new Error('DUPLICATE_NETWORK_SIGNAL_SLOT');
      }
      sourceIdBySignalSlot.set(slot, record.sourceId);
    }

    const sourceKey = `${record.sourceKind}\u0000${record.sourceId}`;
    const targets = targetsBySource.get(sourceKey) ?? new Set<string>();
    if (targets.has(record.targetFundId)) throw new Error('DUPLICATE_PROPAGATION_SOURCE_TARGET');
    targets.add(record.targetFundId);
    targetsBySource.set(sourceKey, targets);
  }
  for (const targets of targetsBySource.values()) {
    if (targets.size !== network.funds.length - 1) {
      throw new Error('INCOMPLETE_NETWORK_PROPAGATION_TARGET_SET');
    }
  }
}
