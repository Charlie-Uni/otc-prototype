import { MAX_BPS } from '../artifact/risk/calc';
import type { SimulationConfig } from '../core/config';
import {
  aggregateSpilloverRedemptionBps,
  spilloverRedemptionBps,
} from '../metrics/spillover';
import type { SimulationState } from '../state/types';
import { validateSimulationState } from '../state/validation';
import {
  effectiveProximityComponents,
  fundNetworkProximityBps,
  fundNetworkProximityComponents,
} from './proximity';
import type {
  NetworkModel,
  NetworkPropagationRecord,
  NetworkSignalSource,
} from './types';

export type NetworkPropagationBatchInput = {
  replicateId: number;
  tick: number;
  propagatedAt: number;
  assetSaleIds: readonly string[];
  signals: readonly NetworkSignalSource[];
};

export type NetworkPropagationTargetSummary = {
  targetFundId: string;
  incomingSpilloverRedemptionBps: number;
  transmittedLoss: number;
};

export type NetworkPropagationBatchResult = {
  state: SimulationState;
  records: NetworkPropagationRecord[];
  targetSummaries: NetworkPropagationTargetSummary[];
};

function requireSafeNonNegative(value: number, field: string): void {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`INVALID_${field}`);
}

function requireBps(value: number, field: string): void {
  if (!Number.isInteger(value) || value < 0 || value > MAX_BPS) {
    throw new Error(`INVALID_${field}`);
  }
}

function propagationIdFor(
  replicateId: number,
  sourceKind: NetworkPropagationRecord['sourceKind'],
  sourceId: string,
  targetFundId: string,
): string {
  return `propagation:r${replicateId}:${sourceKind}:${sourceId}:${targetFundId}`;
}

function commonRecord(
  network: NetworkModel,
  config: SimulationConfig,
  input: NetworkPropagationBatchInput,
  source: {
    kind: NetworkPropagationRecord['sourceKind'];
    id: string;
    fundId: string;
    at: number;
    magnitudeBps: number;
  },
  targetFundId: string,
): Omit<NetworkPropagationRecord,
  | 'transmissionProximityBps'
  | 'transmissionBps'
  | 'spilloverRedemptionBps'
  | 'transmittedLoss'
  | 'assetClassId'
  | 'targetAssetValueBefore'
  | 'targetAssetValueAfter'
> {
  const rawComponents = fundNetworkProximityComponents(network, source.fundId, targetFundId);
  const effectiveComponents = effectiveProximityComponents(
    rawComponents,
    config.propagation.channels,
  );
  return {
    propagationId: propagationIdFor(input.replicateId, source.kind, source.id, targetFundId),
    replicateId: input.replicateId,
    sourceKind: source.kind,
    sourceId: source.id,
    sourceFundId: source.fundId,
    targetFundId,
    tick: input.tick,
    sourceAt: source.at,
    propagatedAt: input.propagatedAt,
    rawComponents,
    effectiveComponents,
    proximityWeightsBps: [...config.propagation.proximityWeightsBps],
    networkProximityBps: fundNetworkProximityBps(
      effectiveComponents,
      config.propagation.proximityWeightsBps,
    ),
    sourceMagnitudeBps: source.magnitudeBps,
  };
}

function signalTransmissionBps(
  config: SimulationConfig,
  kind: NetworkSignalSource['kind'],
): number {
  if (kind === 'redemption_pressure') return config.propagation.investorOverlapTransmissionBps;
  if (kind === 'public_risk') return config.propagation.publicRiskTransmissionBps;
  return config.propagation.publicControlTransmissionBps;
}

function validateBatchInput(
  state: SimulationState,
  network: NetworkModel,
  input: NetworkPropagationBatchInput,
): void {
  requireSafeNonNegative(input.replicateId, 'PROPAGATION_REPLICATE_ID');
  requireSafeNonNegative(input.tick, 'PROPAGATION_TICK');
  requireSafeNonNegative(input.propagatedAt, 'PROPAGATED_AT');
  if (input.propagatedAt !== state.nowSec) throw new Error('PROPAGATION_TIME_MUST_EQUAL_STATE_TIME');
  const fundIds = new Set(network.funds.map(({ id }) => id));
  const sourceKeys = new Set<string>();
  const signalSlots = new Set<string>();
  for (const signal of input.signals) {
    if (!signal.sourceId.trim()) throw new Error('INVALID_NETWORK_SIGNAL_ID');
    const sourceKey = `${signal.kind}\u0000${signal.sourceId}`;
    if (sourceKeys.has(sourceKey)) throw new Error('DUPLICATE_NETWORK_SIGNAL_SOURCE');
    sourceKeys.add(sourceKey);
    const signalSlot = `${signal.kind}\u0000${signal.sourceFundId}\u0000${signal.tick}`;
    if (signalSlots.has(signalSlot)) throw new Error('DUPLICATE_NETWORK_SIGNAL_SLOT');
    signalSlots.add(signalSlot);
    if (!fundIds.has(signal.sourceFundId)) throw new Error('UNKNOWN_NETWORK_SIGNAL_FUND');
    requireSafeNonNegative(signal.tick, 'NETWORK_SIGNAL_TICK');
    requireSafeNonNegative(signal.availableAt, 'NETWORK_SIGNAL_AVAILABLE_AT');
    if (signal.tick !== input.tick) throw new Error('NETWORK_SIGNAL_TICK_MISMATCH');
    if (signal.availableAt > input.propagatedAt) throw new Error('NETWORK_SIGNAL_NOT_AVAILABLE');
    requireBps(signal.magnitudeBps, 'NETWORK_SIGNAL_MAGNITUDE_BPS');
    if (signal.kind === 'public_control' && signal.magnitudeBps !== MAX_BPS) {
      throw new Error('PUBLIC_CONTROL_SIGNAL_MUST_BE_BINARY');
    }
  }
  const saleIds = new Set<string>();
  for (const saleId of input.assetSaleIds) {
    if (!saleId.trim()) throw new Error('INVALID_PROPAGATION_ASSET_SALE_ID');
    if (saleIds.has(saleId)) throw new Error('DUPLICATE_PROPAGATION_ASSET_SALE');
    saleIds.add(saleId);
    if (!state.assetSales.some(({ saleId: candidate }) => candidate === saleId)) {
      throw new Error('UNKNOWN_PROPAGATION_ASSET_SALE');
    }
  }
  const existingSources = new Set(state.networkPropagations.map(
    ({ sourceKind, sourceId }) => `${sourceKind}\u0000${sourceId}`,
  ));
  const existingSignalSlots = new Set(state.networkPropagations
    .filter(({ sourceKind }) => sourceKind !== 'asset_sale')
    .map(({ sourceKind, sourceFundId, tick }) => (
      `${sourceKind}\u0000${sourceFundId}\u0000${tick}`
    )));
  for (const sourceKey of sourceKeys) {
    if (existingSources.has(sourceKey)) throw new Error('NETWORK_SOURCE_ALREADY_PROCESSED');
  }
  for (const saleId of saleIds) {
    if (existingSources.has(`asset_sale\u0000${saleId}`)) {
      throw new Error('NETWORK_SOURCE_ALREADY_PROCESSED');
    }
  }
  for (const signalSlot of signalSlots) {
    if (existingSignalSlots.has(signalSlot)) throw new Error('NETWORK_SIGNAL_SLOT_ALREADY_PROCESSED');
  }
}

function applyAssetSalePropagation(
  state: SimulationState,
  network: NetworkModel,
  config: SimulationConfig,
  input: NetworkPropagationBatchInput,
  saleId: string,
): NetworkPropagationRecord[] {
  const sale = state.assetSales.find(({ saleId: candidate }) => candidate === saleId)!;
  const assetClass = network.assetClasses.find(({ id }) => id === sale.assetClassId)!;
  if (assetClass.liquidity !== 'illiquid') throw new Error('PROPAGATION_REQUIRES_ILLIQUID_ASSET_SALE');
  return network.funds
    .filter(({ id }) => id !== sale.fundId)
    .map(({ id: targetFundId }) => {
      const base = commonRecord(network, config, input, {
        kind: 'asset_sale',
        id: sale.saleId,
        fundId: sale.fundId,
        at: sale.occurredAt,
        magnitudeBps: sale.priceImpactBps,
      }, targetFundId);
      const position = state.assetPositions.find(({ fundId, assetClassId }) => (
        fundId === targetFundId && assetClassId === sale.assetClassId
      ));
      const before = position?.value ?? null;
      const transmissionBps = config.propagation.channels.sharedIlliquidAssets
        ? config.propagation.sharedAssetPassThroughBps
        : 0;
      const transmittedLoss = before === null
        ? 0
        : Number(
          BigInt(before)
            * BigInt(sale.priceImpactBps)
            * BigInt(transmissionBps)
            / BigInt(MAX_BPS)
            / BigInt(MAX_BPS),
        );
      if (position) position.value -= transmittedLoss;
      const fund = state.funds.find(({ fundId }) => fundId === targetFundId)!;
      fund.economicAum -= transmittedLoss;
      return {
        ...base,
        transmissionProximityBps: base.effectiveComponents.sharedIlliquidAssetBps,
        transmissionBps,
        spilloverRedemptionBps: 0,
        transmittedLoss,
        assetClassId: sale.assetClassId,
        targetAssetValueBefore: before,
        targetAssetValueAfter: before === null ? null : before - transmittedLoss,
      };
    });
}

function signalRecords(
  network: NetworkModel,
  config: SimulationConfig,
  input: NetworkPropagationBatchInput,
  signal: NetworkSignalSource,
): NetworkPropagationRecord[] {
  return network.funds
    .filter(({ id }) => id !== signal.sourceFundId)
    .map(({ id: targetFundId }) => {
      const base = commonRecord(network, config, input, {
        kind: signal.kind,
        id: signal.sourceId,
        fundId: signal.sourceFundId,
        at: signal.availableAt,
        magnitudeBps: signal.magnitudeBps,
      }, targetFundId);
      const transmissionProximityBps = signal.kind === 'redemption_pressure'
        ? base.effectiveComponents.investorOverlapBps
        : base.networkProximityBps;
      const transmissionBps = signalTransmissionBps(config, signal.kind);
      return {
        ...base,
        transmissionProximityBps,
        transmissionBps,
        spilloverRedemptionBps: spilloverRedemptionBps(
          signal.magnitudeBps,
          transmissionProximityBps,
          transmissionBps,
        ),
        transmittedLoss: 0,
        assetClassId: null,
        targetAssetValueBefore: null,
        targetAssetValueAfter: null,
      };
    });
}

export function propagateNetworkEffects(
  state: SimulationState,
  network: NetworkModel,
  config: SimulationConfig,
  input: NetworkPropagationBatchInput,
): NetworkPropagationBatchResult {
  validateSimulationState(state, network);
  validateBatchInput(state, network, input);
  const next = structuredClone(state);
  const records: NetworkPropagationRecord[] = [];
  const sales = [...input.assetSaleIds].sort((left, right) => {
    const leftSale = next.assetSales.find(({ saleId }) => saleId === left)!;
    const rightSale = next.assetSales.find(({ saleId }) => saleId === right)!;
    return leftSale.occurredAt - rightSale.occurredAt || left.localeCompare(right);
  });
  for (const saleId of sales) {
    records.push(...applyAssetSalePropagation(next, network, config, input, saleId));
  }
  const signals = [...input.signals].sort((left, right) => (
    left.availableAt - right.availableAt
    || left.kind.localeCompare(right.kind)
    || left.sourceId.localeCompare(right.sourceId)
  ));
  for (const signal of signals) records.push(...signalRecords(network, config, input, signal));
  next.networkPropagations.push(...records);
  validateSimulationState(next, network);

  const targetSummaries = network.funds.map(({ id: targetFundId }) => {
    const incoming = records.filter(({ targetFundId: candidate }) => candidate === targetFundId);
    return {
      targetFundId,
      incomingSpilloverRedemptionBps: aggregateSpilloverRedemptionBps(
        incoming.map(({ spilloverRedemptionBps: value }) => value),
      ),
      transmittedLoss: incoming.reduce((sum, record) => sum + record.transmittedLoss, 0),
    };
  });
  return { state: next, records, targetSummaries };
}
