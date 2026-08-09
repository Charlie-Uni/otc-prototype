import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { parseSimulationConfig } from '../core/config';
import { generateNetworkModel } from '../network/generator';
import { createInitialSimulationState } from '../state/initialization';
import {
  liquidAssetValue,
  runtimeFirstMoverAdvantageBps,
  runtimeLiquidityBufferRatioBps,
} from './buffer';

const config = parseSimulationConfig(JSON.parse(readFileSync(
  new URL('../../config/pilot-baseline.json', import.meta.url),
  'utf8',
)) as unknown);
const network = generateNetworkModel(config);
const state = createInitialSimulationState(network, config.shock.cycleStartAt);

test('derives runtime liquidity and FMA from fund asset state', () => {
  const byTier = Object.fromEntries(network.funds.slice(0, 3).map((fund) => [
    fund.liquidityMismatchTier,
    {
      liquid: liquidAssetValue(state, network, fund.id),
      ratio: runtimeLiquidityBufferRatioBps(state, network, fund.id),
      fma: runtimeFirstMoverAdvantageBps(state, network, fund.id),
    },
  ]));
  assert.deepEqual(byTier, {
    low: { liquid: 45_000_000, ratio: 15_000, fma: 0 },
    medium: { liquid: 30_000_000, ratio: 10_000, fma: 0 },
    high: { liquid: 15_000_000, ratio: 5_000, fma: 5_000 },
  });
});

test('rejects unknown fund identifiers', () => {
  assert.throws(
    () => runtimeLiquidityBufferRatioBps(state, network, 'fund-missing'),
    /UNKNOWN_LIQUIDITY_FUND/,
  );
});
