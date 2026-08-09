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
  assert.equal(state.assetPositions.length, 30);
  assert.deepEqual(state.appliedValuationShocks, []);

  for (const fund of state.funds) {
    assert.equal(fund.economicAum, 100_000_000);
    assert.equal(fund.reportedAum, 100_000_000);
    assert.equal(fund.totalShares, 100_000_000);
    assert.equal(fund.reportedNavPerShareBps, 10_000);
    assert.equal(fund.queuedRedemptionShares, 0);
    assert.equal(fund.cumulativeRequestedShares, 0);
    assert.equal(fund.cumulativeSettledShares, 0);
    assert.equal(fund.lastValuationUpdateAt, INITIAL_AT);
    assert.equal(fund.gated, false);
  }
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
});
