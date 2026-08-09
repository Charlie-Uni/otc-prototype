import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { parseSimulationConfig } from '../core/config';
import { generateNetworkModel } from '../network/generator';
import { createInitialSimulationState } from '../state/initialization';
import { validateSimulationState } from '../state/validation';
import { applyValuationShock } from './valuation';
import { createValuationShockScenarios } from './scenario';

const config = parseSimulationConfig(JSON.parse(readFileSync(
  new URL('../../config/pilot-baseline.json', import.meta.url),
  'utf8',
)) as unknown);
const network = generateNetworkModel(config);
const scenarios = createValuationShockScenarios(config, network, 0);

test('reduces only target illiquid assets and economic AUM by the configured magnitude', () => {
  const scenario = scenarios[1]!;
  const initial = createInitialSimulationState(network, scenario.shockAt);
  const initialCopy = structuredClone(initial);
  const shocked = applyValuationShock(initial, network, scenario);
  const targetBefore = initial.funds.find(({ fundId }) => fundId === scenario.targetFundId)!;
  const targetAfter = shocked.funds.find(({ fundId }) => fundId === scenario.targetFundId)!;
  const liquidAssetIds = new Set(network.assetClasses
    .filter(({ liquidity }) => liquidity === 'liquid')
    .map(({ id }) => id));

  assert.deepEqual(initial, initialCopy);
  assert.equal(targetAfter.economicAum, targetBefore.economicAum - 20_000_000);
  assert.equal(targetAfter.reportedAum, targetBefore.reportedAum);
  assert.equal(targetAfter.reportedNavPerShareBps, targetBefore.reportedNavPerShareBps);
  assert.equal(targetAfter.lastValuationUpdateAt, targetBefore.lastValuationUpdateAt);
  assert.equal(targetAfter.reportedRiskMetrics.valuationHaircutBps, 0);
  for (const before of initial.assetPositions.filter(({ assetClassId }) => liquidAssetIds.has(assetClassId))) {
    const after = shocked.assetPositions.find(
      ({ fundId, assetClassId }) => fundId === before.fundId && assetClassId === before.assetClassId,
    )!;
    assert.equal(after.value, before.value);
  }
  assert.deepEqual(
    shocked.funds.filter(({ fundId }) => fundId !== scenario.targetFundId),
    initial.funds.filter(({ fundId }) => fundId !== scenario.targetFundId),
  );
});

test('preserves exact asset-to-AUM accounting after the shock', () => {
  const scenario = scenarios[2]!;
  const shocked = applyValuationShock(
    createInitialSimulationState(network, scenario.shockAt),
    network,
    scenario,
  );
  for (const fund of shocked.funds) {
    const positionTotal = shocked.assetPositions
      .filter(({ fundId }) => fundId === fund.fundId)
      .reduce((sum, { value }) => sum + value, 0);
    assert.equal(positionTotal, fund.economicAum);
  }
  assert.equal(shocked.appliedValuationShocks[0]!.lossAmount, 30_000_000);
});

test('produces monotone economic losses across the three approved magnitudes', () => {
  const results = scenarios.map((scenario) => applyValuationShock(
    createInitialSimulationState(network, scenario.shockAt),
    network,
    scenario,
  ));
  assert.deepEqual(
    results.map((state) => state.appliedValuationShocks[0]!.lossAmount),
    [10_000_000, 20_000_000, 30_000_000],
  );
});

test('rejects duplicate, mistimed, and unknown-fund shocks', () => {
  const scenario = scenarios[0]!;
  const initial = createInitialSimulationState(network, scenario.shockAt);
  const once = applyValuationShock(initial, network, scenario);
  assert.throws(() => applyValuationShock(once, network, scenario), /SHOCK_ALREADY_APPLIED/);
  assert.throws(
    () => applyValuationShock({ ...initial, nowSec: initial.nowSec + 1 }, network, scenario),
    /SHOCK_TIME_STATE_MISMATCH/,
  );
  assert.throws(
    () => applyValuationShock(initial, network, { ...scenario, targetFundId: 'fund-missing' }),
    /UNKNOWN_VALUATION_SHOCK_FUND/,
  );

  const invalidEvidence = structuredClone(once);
  invalidEvidence.appliedValuationShocks[0]!.lossAmount += 1;
  assert.throws(
    () => validateSimulationState(invalidEvidence, network),
    /APPLIED_SHOCK_ACCOUNTING_MISMATCH/,
  );
});
