import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { parseSimulationConfig, type SimulationConfig } from '../core/config';
import { generateNetworkModel, summarizeNetwork } from './generator';
import { validateNetworkModel } from './validation';

const baselineInput = JSON.parse(readFileSync(
  new URL('../../config/pilot-baseline.json', import.meta.url),
  'utf8',
)) as unknown;
const baselineConfig = parseSimulationConfig(baselineInput);

test('generates the mentor-approved network structure and relation counts', () => {
  const model = generateNetworkModel(baselineConfig);
  const summary = summarizeNetwork(model);

  assert.equal(model.funds.length, 10);
  assert.equal(model.investors.length, 200);
  assert.equal(model.assetClasses.length, 5);
  assert.equal(model.managers.length, 2);
  assert.equal(model.serviceProviders.length, 3);
  assert.equal(model.valuationMethods.length, 2);
  assert.equal(model.managerRelations.length, 10);
  assert.equal(model.serviceProviderRelations.length, 10);
  assert.equal(model.valuationMethodRelations.length, 10);
  assert.deepEqual(summary, {
    holdingEdgeCount: 200,
    assetExposureEdgeCount: 30,
    activeInvestorCount: 146,
    overlappingInvestorCount: 6,
  });
});

test('covers all liquidity and stale-pricing tier combinations without one-dimensional risk sorting', () => {
  const model = generateNetworkModel(baselineConfig);
  const firstNine = model.funds.slice(0, 9);
  const combinations = new Set(firstNine.map(
    (fund) => `${fund.liquidityMismatchTier}:${fund.stalePricingTier}`,
  ));
  assert.equal(combinations.size, 9);
  assert.equal(model.funds[9]!.liquidityMismatchTier, 'medium');
  assert.equal(model.funds[9]!.stalePricingTier, 'medium');
  assert.equal(model.funds[9]!.concentrationTier, 'medium');

  const concentrationCounts = model.funds.reduce<Record<string, number>>((counts, fund) => {
    counts[fund.concentrationTier] = (counts[fund.concentrationTier] ?? 0) + 1;
    return counts;
  }, {});
  assert.deepEqual(concentrationCounts, { low: 3, medium: 4, high: 3 });
});

test('derives ordered liquidity, stale-pricing, and concentration measures from primitive inputs', () => {
  const model = generateNetworkModel(baselineConfig);
  const byLiquidityTier = Object.fromEntries(model.funds.map((fund) => [
    fund.liquidityMismatchTier,
    fund.liquidityBufferRatioBps,
  ]));
  const byStaleTier = Object.fromEntries(model.funds.map((fund) => [
    fund.stalePricingTier,
    fund.navUpdateIntervalDays,
  ]));
  const byConcentrationTier = Object.fromEntries(model.funds.map((fund) => [
    fund.concentrationTier,
    fund.investorConcentrationBps,
  ]));

  assert.deepEqual(byLiquidityTier, { low: 15_000, medium: 10_000, high: 5_000 });
  assert.deepEqual(byStaleTier, { low: 1, medium: 7, high: 14 });
  assert.deepEqual(byConcentrationTier, { low: 500, medium: 1_157, high: 2_631 });
});

test('conserves holder shares and asset exposures for every fund', () => {
  const model = generateNetworkModel(baselineConfig);
  for (const fund of model.funds) {
    const holderShares = model.holdings
      .filter(({ fundId }) => fundId === fund.id)
      .map(({ shareBps }) => shareBps);
    const assetWeights = model.assetExposures
      .filter(({ fundId }) => fundId === fund.id)
      .map(({ exposureBps }) => exposureBps);
    assert.equal(holderShares.length, 20);
    assert.equal(holderShares.reduce((sum, value) => sum + value, 0), 10_000);
    assert.equal(assetWeights.length, 3);
    assert.equal(assetWeights.reduce((sum, value) => sum + value, 0), 10_000);
  }
  assert.deepEqual(
    new Set(model.assetExposures.map(({ assetClassId }) => assetClassId)),
    new Set(model.assetClasses.map(({ id }) => id)),
  );
});

test('reproduces the exact network for the same seed', () => {
  const first = generateNetworkModel(baselineConfig);
  const second = generateNetworkModel(baselineConfig);
  assert.deepEqual(second, first);
});

test('changes identities but not structural treatment values when the seed changes', () => {
  const input = structuredClone(baselineInput) as Record<string, Record<string, unknown>>;
  input.network.networkSeed = baselineConfig.network.networkSeed + 1;
  const alternativeConfig = parseSimulationConfig(input);
  const baseline = generateNetworkModel(baselineConfig);
  const alternative = generateNetworkModel(alternativeConfig);

  assert.notDeepEqual(alternative.holdings, baseline.holdings);
  assert.deepEqual(
    alternative.funds.map(({ id, investorConcentrationBps, ...fund }) => fund),
    baseline.funds.map(({ id, investorConcentrationBps, ...fund }) => fund),
  );
  assert.deepEqual(
    alternative.funds.map(({ investorConcentrationBps }) => investorConcentrationBps),
    baseline.funds.map(({ investorConcentrationBps }) => investorConcentrationBps),
  );
});

test('rejects malformed conservation totals and dangling institutional relations', () => {
  const invalidHoldingModel = structuredClone(generateNetworkModel(baselineConfig));
  invalidHoldingModel.holdings[0]!.shareBps += 1;
  assert.throws(
    () => validateNetworkModel(invalidHoldingModel, baselineConfig),
    /HOLDING_WEIGHTS_MUST_SUM_10000/,
  );

  const invalidRelationModel = structuredClone(generateNetworkModel(baselineConfig));
  invalidRelationModel.managerRelations[0]!.institutionId = 'manager-missing';
  assert.throws(
    () => validateNetworkModel(invalidRelationModel, baselineConfig),
    /UNKNOWN_MANAGER/,
  );
});

test('rejects a fund whose declared tier does not match its generated primitive', () => {
  const model = structuredClone(generateNetworkModel(baselineConfig));
  model.funds[0]!.navUpdateIntervalDays = 99;
  assert.throws(
    () => validateNetworkModel(model, baselineConfig),
    /STALE_PRICING_TIER_MISMATCH/,
  );
});
