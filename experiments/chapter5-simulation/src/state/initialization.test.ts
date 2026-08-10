import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { parseSimulationConfig } from '../core/config';
import { generateNetworkModel } from '../network/generator';
import { createInitialSimulationState } from './initialization';
import { validateSimulationState } from './validation';

const config = parseSimulationConfig(JSON.parse(readFileSync(
  new URL('../../config/pilot-baseline.json', import.meta.url),
  'utf8',
)) as unknown);
const network = generateNetworkModel(config);
const INITIAL_AT = config.shock.cycleStartAt + 123;

test('creates a complete pre-shock state from the generated network', () => {
  const state = createInitialSimulationState(network, INITIAL_AT);
  assert.equal(state.nowSec, INITIAL_AT);
  assert.equal(state.funds.length, 10);
  assert.equal(state.holderBalances.length, 200);
  assert.equal(state.assetPositions.length, 30);
  assert.deepEqual(state.appliedValuationShocks, []);
  assert.deepEqual(state.oracleRiskSnapshots, []);
  assert.deepEqual(state.controlTransitions, []);

  for (const fund of state.funds) {
    assert.equal(fund.economicAum, 100_000_000);
    assert.equal(fund.reportedAum, 100_000_000);
    assert.equal(fund.totalShares, 100_000_000);
    assert.equal(fund.reportedNavPerShareBps, 10_000);
    assert.equal(fund.queuedRedemptionShares, 0);
    assert.equal(fund.cumulativeRequestedShares, 0);
    assert.equal(fund.cumulativeSettledShares, 0);
    assert.equal(fund.cumulativeSettlementAmount, 0);
    assert.equal(fund.cumulativeFireSaleDiscountLoss, 0);
    assert.equal(fund.lastValuationAsOf, INITIAL_AT);
    assert.equal(fund.lastValuationUpdateAt, INITIAL_AT);
    assert.equal(fund.gated, false);
    assert.equal(fund.gatePhiBps, 0);
    assert.equal(fund.gatedAt, null);
    assert.equal(fund.gateTriggerSubmissionId, null);
    assert.equal(fund.gateReleaseStreakTicks, 0);
    assert.equal(fund.gateReleaseEligibleAtTick, null);
    assert.equal(fund.lastControlSubmissionId, null);
    assert.equal(fund.lastControlEvaluationTick, null);
  }
  assert.deepEqual(state.redemptionRequests, []);
  assert.deepEqual(state.assetSales, []);
});

test('initializes risk metrics from network primitives without inventing flow or stale risk', () => {
  const state = createInitialSimulationState(network, INITIAL_AT);
  for (const fund of state.funds) {
    const networkFund = network.funds.find(({ id }) => id === fund.fundId)!;
    assert.deepEqual(fund.reportedRiskMetrics, {
      valuationHaircutBps: 0,
      redemptionPressureBps: 0,
      redemptionQueueRatioBps: 0,
      liquidityShortfallBps: Math.max(0, 10_000 - networkFund.liquidityBufferRatioBps),
      stalePricingRiskBps: 0,
      investorConcentrationBps: networkFund.investorConcentrationBps,
    });
  }
});

test('conserves economic AUM across exact integer asset positions', () => {
  const state = createInitialSimulationState(network, INITIAL_AT);
  for (const fund of state.funds) {
    const positionTotal = state.assetPositions
      .filter(({ fundId }) => fundId === fund.fundId)
      .reduce((sum, { value }) => sum + value, 0);
    assert.equal(positionTotal, fund.economicAum);
  }
});

test('materializes share registration balances that exactly equal total supply', () => {
  const state = createInitialSimulationState(network, INITIAL_AT);
  for (const fund of state.funds) {
    const registeredShares = state.holderBalances
      .filter(({ fundId }) => fundId === fund.fundId)
      .reduce((sum, { shares }) => sum + shares, 0);
    assert.equal(registeredShares, fund.totalShares);
  }
});

test('rejects invalid initial times and inconsistent runtime state', () => {
  assert.throws(() => createInitialSimulationState(network, -1), /INVALID_INITIAL_STATE_TIME/);
  const invalid = createInitialSimulationState(network, INITIAL_AT);
  invalid.funds[0]!.queuedRedemptionShares = invalid.funds[0]!.totalShares + 1;
  assert.throws(() => validateSimulationState(invalid, network), /QUEUE_EXCEEDS_TOTAL_SHARES/);

  const missingPosition = createInitialSimulationState(network, INITIAL_AT);
  missingPosition.assetPositions.pop();
  assert.throws(
    () => validateSimulationState(missingPosition, network),
    /ASSET_POSITION_COUNT_MISMATCH/,
  );

  const inconsistentRegister = createInitialSimulationState(network, INITIAL_AT);
  inconsistentRegister.holderBalances[0]!.shares -= 1;
  assert.throws(
    () => validateSimulationState(inconsistentRegister, network),
    /HOLDER_SHARES_TOTAL_SUPPLY_MISMATCH/,
  );
});
