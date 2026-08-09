import { computeInvestorConcentrationBps, MAX_BPS } from '../artifact/risk/calc';
import type { SimulationConfig } from '../core/config';
import { deterministicShuffle, type RandomDrawKey } from '../core/rng';
import { RISK_TIERS, type NetworkModel, type NetworkSummary, type RiskTier } from './types';
import { validateNetworkModel } from './validation';

const ILLIQUID_EXPOSURE_SPLIT_BPS = 6_000;

function indexedId(prefix: string, index: number): string {
  return `${prefix}-${String(index + 1).padStart(3, '0')}`;
}

function holderWeights(holderCount: number, topHolderShareBps: number): number[] {
  const otherHolderCount = holderCount - 1;
  const remaining = MAX_BPS - topHolderShareBps;
  const baseWeight = Math.floor(remaining / otherHolderCount);
  const remainder = remaining % otherHolderCount;
  return [
    topHolderShareBps,
    ...Array.from({ length: otherHolderCount }, (_, index) => baseWeight + (index < remainder ? 1 : 0)),
  ];
}

function fundTierDesign(fundIndex: number): {
  liquidityMismatchTier: RiskTier;
  stalePricingTier: RiskTier;
  concentrationTier: RiskTier;
} {
  const position = fundIndex % 10;
  if (position === 9) {
    return {
      liquidityMismatchTier: 'medium',
      stalePricingTier: 'medium',
      concentrationTier: 'medium',
    };
  }
  const liquidityIndex = position % 3;
  const staleIndex = Math.floor(position / 3);
  return {
    liquidityMismatchTier: RISK_TIERS[liquidityIndex]!,
    stalePricingTier: RISK_TIERS[staleIndex]!,
    concentrationTier: RISK_TIERS[(liquidityIndex + staleIndex) % RISK_TIERS.length]!,
  };
}

function randomKey(masterSeed: bigint, entityId: string, drawPurpose: string): RandomDrawKey {
  return {
    masterSeed,
    replicateId: 0,
    entityId,
    moduleId: 'network-initialization',
    tick: 0,
    drawPurpose,
  };
}

export function generateNetworkModel(config: SimulationConfig): NetworkModel {
  const masterSeed = BigInt(config.network.networkSeed);
  const investors = Array.from({ length: config.network.investorCount }, (_, index) => ({
    id: indexedId('investor', index),
  }));
  const investorOrder = deterministicShuffle(
    investors.map(({ id }) => id),
    randomKey(masterSeed, 'investor-universe', 'holder-permutation'),
  );
  const sharedHolderCount = Math.floor(
    (config.heterogeneity.holderCountPerFund * config.network.sharedInvestorCoreBps) / MAX_BPS,
  );
  const sharedInvestorCoreIds = investorOrder.slice(0, sharedHolderCount);
  const uniqueInvestorIds = investorOrder.slice(sharedHolderCount);
  let uniqueInvestorOffset = 0;

  const assetClasses = Array.from({ length: config.network.assetClassCount }, (_, index) => ({
    id: indexedId('asset', index),
    liquidity: index === 0 ? 'liquid' as const : 'illiquid' as const,
  }));
  const managers = Array.from({ length: config.network.managerCount }, (_, index) => ({
    id: indexedId('manager', index),
  }));
  const serviceProviders = Array.from({ length: config.network.serviceProviderCount }, (_, index) => ({
    id: indexedId('provider', index),
  }));
  const valuationMethods = Array.from({ length: config.network.valuationMethodCount }, (_, index) => ({
    id: indexedId('valuation-method', index),
  }));

  const funds: NetworkModel['funds'] = [];
  const holdings: NetworkModel['holdings'] = [];
  const assetExposures: NetworkModel['assetExposures'] = [];
  const managerRelations: NetworkModel['managerRelations'] = [];
  const serviceProviderRelations: NetworkModel['serviceProviderRelations'] = [];
  const valuationMethodRelations: NetworkModel['valuationMethodRelations'] = [];

  for (let fundIndex = 0; fundIndex < config.network.fundCount; fundIndex += 1) {
    const fundId = indexedId('fund', fundIndex);
    const tiers = fundTierDesign(fundIndex);
    const uniqueHolderCount = config.heterogeneity.holderCountPerFund - sharedHolderCount;
    const uniqueHolders = uniqueInvestorIds.slice(uniqueInvestorOffset, uniqueInvestorOffset + uniqueHolderCount);
    uniqueInvestorOffset += uniqueHolderCount;
    const holderIds = deterministicShuffle(
      [...sharedInvestorCoreIds, ...uniqueHolders],
      randomKey(masterSeed, fundId, 'holder-weight-assignment'),
    );
    const weights = holderWeights(
      config.heterogeneity.holderCountPerFund,
      config.heterogeneity.topHolderShareBpsByConcentrationTier[tiers.concentrationTier],
    );
    holdings.push(...holderIds.map((investorId, index) => ({
      fundId,
      investorId,
      shareBps: weights[index]!,
    })));

    const liquidAssetShareBps =
      config.heterogeneity.liquidAssetShareBpsByLiquidityMismatchTier[tiers.liquidityMismatchTier];
    const expectedClaimsBps = config.heterogeneity.expectedRedemptionClaimsBps;
    const liquidityBufferRatioBps = Math.floor((liquidAssetShareBps * MAX_BPS) / expectedClaimsBps);
    funds.push({
      id: fundId,
      initialAum: config.heterogeneity.initialAum,
      initialTotalShares: config.heterogeneity.initialTotalShares,
      ...tiers,
      expectedRedemptionClaimsBps: expectedClaimsBps,
      liquidAssetShareBps,
      liquidityBufferRatioBps,
      navUpdateIntervalDays:
        config.heterogeneity.navUpdateIntervalDaysByStalePricingTier[tiers.stalePricingTier],
      investorConcentrationBps: computeInvestorConcentrationBps(weights),
    });

    const illiquidAssetCount = assetClasses.length - 1;
    const firstIlliquidAsset = assetClasses[1 + (fundIndex % illiquidAssetCount)]!;
    const secondIlliquidAsset = assetClasses[1 + ((fundIndex + 1) % illiquidAssetCount)]!;
    const illiquidExposureBps = MAX_BPS - liquidAssetShareBps;
    const firstIlliquidExposureBps = Math.floor(
      (illiquidExposureBps * ILLIQUID_EXPOSURE_SPLIT_BPS) / MAX_BPS,
    );
    assetExposures.push(
      { fundId, assetClassId: assetClasses[0]!.id, exposureBps: liquidAssetShareBps },
      { fundId, assetClassId: firstIlliquidAsset.id, exposureBps: firstIlliquidExposureBps },
      {
        fundId,
        assetClassId: secondIlliquidAsset.id,
        exposureBps: illiquidExposureBps - firstIlliquidExposureBps,
      },
    );

    managerRelations.push({ fundId, institutionId: managers[fundIndex % managers.length]!.id });
    serviceProviderRelations.push({
      fundId,
      institutionId: serviceProviders[fundIndex % serviceProviders.length]!.id,
    });
    valuationMethodRelations.push({
      fundId,
      institutionId: valuationMethods[fundIndex % valuationMethods.length]!.id,
    });
  }

  const model: NetworkModel = {
    schemaVersion: 1,
    networkSeed: config.network.networkSeed,
    funds,
    investors,
    assetClasses,
    managers,
    serviceProviders,
    valuationMethods,
    holdings,
    assetExposures,
    managerRelations,
    serviceProviderRelations,
    valuationMethodRelations,
    sharedInvestorCoreIds,
  };
  validateNetworkModel(model, config);
  return model;
}

export function summarizeNetwork(model: NetworkModel): NetworkSummary {
  const holdingCounts = new Map<string, number>();
  for (const holding of model.holdings) {
    holdingCounts.set(holding.investorId, (holdingCounts.get(holding.investorId) ?? 0) + 1);
  }
  return {
    holdingEdgeCount: model.holdings.length,
    assetExposureEdgeCount: model.assetExposures.length,
    activeInvestorCount: holdingCounts.size,
    overlappingInvestorCount: [...holdingCounts.values()].filter((count) => count > 1).length,
  };
}
