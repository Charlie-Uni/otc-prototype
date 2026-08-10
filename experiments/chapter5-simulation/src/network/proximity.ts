import { MAX_BPS } from '../artifact/risk/calc';
import type {
  FundInstitutionRelation,
  NetworkModel,
  NetworkProximityComponents,
  NetworkTransmissionChannels,
} from './types';

export type ProximityWeightsBps = readonly [number, number, number, number];

function requireFundPair(network: NetworkModel, sourceFundId: string, targetFundId: string): void {
  if (sourceFundId === targetFundId) throw new Error('NETWORK_PROXIMITY_REQUIRES_DISTINCT_FUNDS');
  const fundIds = new Set(network.funds.map(({ id }) => id));
  if (!fundIds.has(sourceFundId)) throw new Error('UNKNOWN_PROXIMITY_SOURCE_FUND');
  if (!fundIds.has(targetFundId)) throw new Error('UNKNOWN_PROXIMITY_TARGET_FUND');
}

function weightedJaccardBps(
  source: ReadonlyMap<string, number>,
  target: ReadonlyMap<string, number>,
): number {
  const keys = new Set([...source.keys(), ...target.keys()]);
  let intersection = 0;
  let union = 0;
  for (const key of keys) {
    const sourceWeight = source.get(key) ?? 0;
    const targetWeight = target.get(key) ?? 0;
    if (
      !Number.isSafeInteger(sourceWeight)
      || sourceWeight < 0
      || !Number.isSafeInteger(targetWeight)
      || targetWeight < 0
    ) {
      throw new Error('INVALID_NETWORK_OVERLAP_WEIGHT');
    }
    intersection += Math.min(sourceWeight, targetWeight);
    union += Math.max(sourceWeight, targetWeight);
  }
  if (union === 0) return 0;
  return Number((BigInt(intersection) * BigInt(MAX_BPS)) / BigInt(union));
}

function relationFor(relations: readonly FundInstitutionRelation[], fundId: string): string {
  const relation = relations.find(({ fundId: candidate }) => candidate === fundId);
  if (!relation) throw new Error('MISSING_PROXIMITY_INSTITUTION_RELATION');
  return relation.institutionId;
}

function fundWeights(
  rows: readonly { fundId: string; key: string; weight: number }[],
  fundId: string,
): Map<string, number> {
  return new Map(
    rows
      .filter(({ fundId: candidate }) => candidate === fundId)
      .map(({ key, weight }) => [key, weight]),
  );
}

export function fundNetworkProximityComponents(
  network: NetworkModel,
  sourceFundId: string,
  targetFundId: string,
): NetworkProximityComponents {
  requireFundPair(network, sourceFundId, targetFundId);
  const illiquidAssetIds = new Set(
    network.assetClasses
      .filter(({ liquidity }) => liquidity === 'illiquid')
      .map(({ id }) => id),
  );
  const assetRows = network.assetExposures
    .filter(({ assetClassId }) => illiquidAssetIds.has(assetClassId))
    .map(({ fundId, assetClassId, exposureBps }) => ({
      fundId,
      key: assetClassId,
      weight: exposureBps,
    }));
  const holdingRows = network.holdings.map(({ fundId, investorId, shareBps }) => ({
    fundId,
    key: investorId,
    weight: shareBps,
  }));
  const sameManager = relationFor(network.managerRelations, sourceFundId)
    === relationFor(network.managerRelations, targetFundId);
  const sameProvider = relationFor(network.serviceProviderRelations, sourceFundId)
    === relationFor(network.serviceProviderRelations, targetFundId);
  const sameValuationMethod = relationFor(network.valuationMethodRelations, sourceFundId)
    === relationFor(network.valuationMethodRelations, targetFundId);

  return {
    sharedIlliquidAssetBps: weightedJaccardBps(
      fundWeights(assetRows, sourceFundId),
      fundWeights(assetRows, targetFundId),
    ),
    investorOverlapBps: weightedJaccardBps(
      fundWeights(holdingRows, sourceFundId),
      fundWeights(holdingRows, targetFundId),
    ),
    commonServiceOrManagerBps: Number(sameManager) * 5_000 + Number(sameProvider) * 5_000,
    valuationMethodSimilarityBps: sameValuationMethod ? MAX_BPS : 0,
  };
}

export function effectiveProximityComponents(
  components: NetworkProximityComponents,
  channels: NetworkTransmissionChannels,
): NetworkProximityComponents {
  return {
    sharedIlliquidAssetBps: channels.sharedIlliquidAssets
      ? components.sharedIlliquidAssetBps
      : 0,
    investorOverlapBps: channels.investorOverlap ? components.investorOverlapBps : 0,
    commonServiceOrManagerBps: channels.signalAnalogy
      ? components.commonServiceOrManagerBps
      : 0,
    valuationMethodSimilarityBps: channels.signalAnalogy
      ? components.valuationMethodSimilarityBps
      : 0,
  };
}

export function fundNetworkProximityBps(
  components: NetworkProximityComponents,
  weightsBps: ProximityWeightsBps,
): number {
  const values = [
    components.sharedIlliquidAssetBps,
    components.investorOverlapBps,
    components.commonServiceOrManagerBps,
    components.valuationMethodSimilarityBps,
  ];
  for (const value of [...values, ...weightsBps]) {
    if (!Number.isInteger(value) || value < 0 || value > MAX_BPS) {
      throw new Error('INVALID_NETWORK_PROXIMITY_BPS');
    }
  }
  if (weightsBps.reduce((sum, weight) => sum + weight, 0) !== MAX_BPS) {
    throw new Error('PROXIMITY_WEIGHTS_MUST_SUM_10000');
  }
  return Number(values.reduce(
    (sum, value, index) => sum + BigInt(value) * BigInt(weightsBps[index]!),
    0n,
  ) / BigInt(MAX_BPS));
}
