import { computeInvestorConcentrationBps, MAX_BPS } from '../artifact/risk/calc';
import type { SimulationConfig } from '../core/config';
import type { FundInstitutionRelation, NetworkModel } from './types';

function requireUniqueIds(ids: string[], label: string): Set<string> {
  const idSet = new Set(ids);
  if (idSet.size !== ids.length) throw new Error(`DUPLICATE_${label}_ID`);
  return idSet;
}

function requireBps(value: number, label: string): void {
  if (!Number.isInteger(value) || value <= 0 || value > MAX_BPS) {
    throw new Error(`INVALID_${label}_BPS`);
  }
}

function validateInstitutionRelations(
  relations: FundInstitutionRelation[],
  fundIds: Set<string>,
  institutionIds: Set<string>,
  relationType: string,
): void {
  const seenFunds = new Set<string>();
  for (const relation of relations) {
    if (!fundIds.has(relation.fundId)) throw new Error(`UNKNOWN_${relationType}_FUND`);
    if (!institutionIds.has(relation.institutionId)) throw new Error(`UNKNOWN_${relationType}`);
    if (seenFunds.has(relation.fundId)) throw new Error(`DUPLICATE_${relationType}_RELATION`);
    seenFunds.add(relation.fundId);
  }
  if (seenFunds.size !== fundIds.size) throw new Error(`MISSING_${relationType}_RELATION`);
}

export function validateNetworkModel(model: NetworkModel, config: SimulationConfig): void {
  if (model.schemaVersion !== 1) throw new Error('UNSUPPORTED_NETWORK_SCHEMA');
  if (model.networkSeed !== config.network.networkSeed) throw new Error('NETWORK_SEED_MISMATCH');
  if (model.funds.length !== config.network.fundCount) throw new Error('FUND_COUNT_MISMATCH');
  if (model.investors.length !== config.network.investorCount) throw new Error('INVESTOR_COUNT_MISMATCH');
  if (model.assetClasses.length !== config.network.assetClassCount) throw new Error('ASSET_COUNT_MISMATCH');
  if (model.managers.length !== config.network.managerCount) throw new Error('MANAGER_COUNT_MISMATCH');
  if (model.serviceProviders.length !== config.network.serviceProviderCount) {
    throw new Error('SERVICE_PROVIDER_COUNT_MISMATCH');
  }
  if (model.valuationMethods.length !== config.network.valuationMethodCount) {
    throw new Error('VALUATION_METHOD_COUNT_MISMATCH');
  }

  const fundIds = requireUniqueIds(model.funds.map(({ id }) => id), 'FUND');
  const investorIds = requireUniqueIds(model.investors.map(({ id }) => id), 'INVESTOR');
  const assetIds = requireUniqueIds(model.assetClasses.map(({ id }) => id), 'ASSET');
  if (model.assetClasses.filter(({ liquidity }) => liquidity === 'liquid').length !== 1) {
    throw new Error('EXPECTED_ONE_LIQUID_ASSET_CLASS');
  }
  const managerIds = requireUniqueIds(model.managers.map(({ id }) => id), 'MANAGER');
  const serviceProviderIds = requireUniqueIds(
    model.serviceProviders.map(({ id }) => id),
    'SERVICE_PROVIDER',
  );
  const valuationMethodIds = requireUniqueIds(
    model.valuationMethods.map(({ id }) => id),
    'VALUATION_METHOD',
  );

  const holdingsByFund = new Map<string, number[]>();
  const holdingPairs = new Set<string>();
  for (const holding of model.holdings) {
    if (!fundIds.has(holding.fundId)) throw new Error('UNKNOWN_HOLDING_FUND');
    if (!investorIds.has(holding.investorId)) throw new Error('UNKNOWN_HOLDING_INVESTOR');
    requireBps(holding.shareBps, 'HOLDING_SHARE');
    const pair = `${holding.fundId}\u0000${holding.investorId}`;
    if (holdingPairs.has(pair)) throw new Error('DUPLICATE_HOLDING_EDGE');
    holdingPairs.add(pair);
    const weights = holdingsByFund.get(holding.fundId) ?? [];
    weights.push(holding.shareBps);
    holdingsByFund.set(holding.fundId, weights);
  }

  for (const fund of model.funds) {
    const weights = holdingsByFund.get(fund.id) ?? [];
    if (weights.length !== config.heterogeneity.holderCountPerFund) {
      throw new Error('HOLDER_COUNT_MISMATCH');
    }
    if (weights.reduce((sum, value) => sum + value, 0) !== MAX_BPS) {
      throw new Error('HOLDING_WEIGHTS_MUST_SUM_10000');
    }
    if (computeInvestorConcentrationBps(weights) !== fund.investorConcentrationBps) {
      throw new Error('INVESTOR_CONCENTRATION_MISMATCH');
    }
    if (fund.initialAum <= 0 || fund.initialTotalShares <= 0) throw new Error('INVALID_FUND_SCALE');
    const expectedLiquidShare =
      config.heterogeneity.liquidAssetShareBpsByLiquidityMismatchTier[fund.liquidityMismatchTier];
    const expectedNavInterval =
      config.heterogeneity.navUpdateIntervalDaysByStalePricingTier[fund.stalePricingTier];
    const expectedTopShare =
      config.heterogeneity.topHolderShareBpsByConcentrationTier[fund.concentrationTier];
    if (fund.expectedRedemptionClaimsBps !== config.heterogeneity.expectedRedemptionClaimsBps) {
      throw new Error('EXPECTED_REDEMPTION_CLAIMS_MISMATCH');
    }
    if (fund.liquidAssetShareBps !== expectedLiquidShare) throw new Error('LIQUIDITY_TIER_MISMATCH');
    if (fund.navUpdateIntervalDays !== expectedNavInterval) throw new Error('STALE_PRICING_TIER_MISMATCH');
    if (Math.max(...weights) !== expectedTopShare) throw new Error('CONCENTRATION_TIER_MISMATCH');
    const expectedBufferRatio = Math.floor(
      (expectedLiquidShare * MAX_BPS) / config.heterogeneity.expectedRedemptionClaimsBps,
    );
    if (fund.liquidityBufferRatioBps !== expectedBufferRatio) {
      throw new Error('LIQUIDITY_BUFFER_RATIO_MISMATCH');
    }
  }

  const exposuresByFund = new Map<string, number[]>();
  const exposurePairs = new Set<string>();
  for (const exposure of model.assetExposures) {
    if (!fundIds.has(exposure.fundId)) throw new Error('UNKNOWN_EXPOSURE_FUND');
    if (!assetIds.has(exposure.assetClassId)) throw new Error('UNKNOWN_EXPOSURE_ASSET');
    requireBps(exposure.exposureBps, 'ASSET_EXPOSURE');
    const pair = `${exposure.fundId}\u0000${exposure.assetClassId}`;
    if (exposurePairs.has(pair)) throw new Error('DUPLICATE_ASSET_EXPOSURE');
    exposurePairs.add(pair);
    const weights = exposuresByFund.get(exposure.fundId) ?? [];
    weights.push(exposure.exposureBps);
    exposuresByFund.set(exposure.fundId, weights);
  }
  for (const fund of model.funds) {
    const weights = exposuresByFund.get(fund.id) ?? [];
    if (weights.length !== 3) throw new Error('ASSET_EXPOSURE_COUNT_MISMATCH');
    if (weights.reduce((sum, value) => sum + value, 0) !== MAX_BPS) {
      throw new Error('ASSET_EXPOSURES_MUST_SUM_10000');
    }
    const liquidExposure = model.assetExposures.find(
      ({ fundId, assetClassId }) => fundId === fund.id && model.assetClasses.find(
        ({ id }) => id === assetClassId,
      )?.liquidity === 'liquid',
    );
    if (liquidExposure?.exposureBps !== fund.liquidAssetShareBps) {
      throw new Error('LIQUID_ASSET_SHARE_MISMATCH');
    }
  }

  validateInstitutionRelations(model.managerRelations, fundIds, managerIds, 'MANAGER');
  validateInstitutionRelations(
    model.serviceProviderRelations,
    fundIds,
    serviceProviderIds,
    'SERVICE_PROVIDER',
  );
  validateInstitutionRelations(
    model.valuationMethodRelations,
    fundIds,
    valuationMethodIds,
    'VALUATION_METHOD',
  );

  const expectedSharedCount = Math.floor(
    (config.heterogeneity.holderCountPerFund * config.network.sharedInvestorCoreBps) / MAX_BPS,
  );
  if (model.sharedInvestorCoreIds.length !== expectedSharedCount) {
    throw new Error('SHARED_INVESTOR_CORE_COUNT_MISMATCH');
  }
  const sharedIds = requireUniqueIds(model.sharedInvestorCoreIds, 'SHARED_INVESTOR_CORE');
  for (const investorId of sharedIds) {
    if (!investorIds.has(investorId)) throw new Error('UNKNOWN_SHARED_INVESTOR');
    const fundCount = model.holdings.filter((holding) => holding.investorId === investorId).length;
    if (fundCount !== model.funds.length) throw new Error('INCOMPLETE_SHARED_INVESTOR_CORE');
  }
}
