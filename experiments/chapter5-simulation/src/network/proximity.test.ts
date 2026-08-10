import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { parseSimulationConfig } from '../core/config';
import { generateNetworkModel } from './generator';
import {
  effectiveProximityComponents,
  fundNetworkProximityBps,
  fundNetworkProximityComponents,
} from './proximity';

const config = parseSimulationConfig(JSON.parse(readFileSync(
  new URL('../../config/pilot-baseline.json', import.meta.url),
  'utf8',
)));
const network = generateNetworkModel(config);

test('derives symmetric four-channel proximity from primitive network edges', () => {
  const forward = fundNetworkProximityComponents(network, 'fund-001', 'fund-002');
  const reverse = fundNetworkProximityComponents(network, 'fund-002', 'fund-001');
  assert.deepEqual(forward, reverse);
  for (const value of Object.values(forward)) assert.ok(value >= 0 && value <= 10_000);
  assert.ok(forward.sharedIlliquidAssetBps > 0);
  assert.ok(forward.investorOverlapBps > 0);
});

test('applies the thesis chi-weighted proximity formula exactly', () => {
  const components = {
    sharedIlliquidAssetBps: 8_000,
    investorOverlapBps: 4_000,
    commonServiceOrManagerBps: 2_000,
    valuationMethodSimilarityBps: 10_000,
  };
  assert.equal(
    fundNetworkProximityBps(components, [2_500, 2_500, 2_500, 2_500]),
    6_000,
  );
});

test('removes only the selected mechanism family without renormalizing chi', () => {
  const raw = fundNetworkProximityComponents(network, 'fund-001', 'fund-002');
  const effective = effectiveProximityComponents(raw, {
    sharedIlliquidAssets: false,
    investorOverlap: true,
    signalAnalogy: false,
  });
  assert.equal(effective.sharedIlliquidAssetBps, 0);
  assert.equal(effective.investorOverlapBps, raw.investorOverlapBps);
  assert.equal(effective.commonServiceOrManagerBps, 0);
  assert.equal(effective.valuationMethodSimilarityBps, 0);
});

test('rejects self-pairs, unknown funds, and malformed weight schemes', () => {
  assert.throws(
    () => fundNetworkProximityComponents(network, 'fund-001', 'fund-001'),
    /NETWORK_PROXIMITY_REQUIRES_DISTINCT_FUNDS/,
  );
  assert.throws(
    () => fundNetworkProximityComponents(network, 'fund-001', 'fund-missing'),
    /UNKNOWN_PROXIMITY_TARGET_FUND/,
  );
  assert.throws(
    () => fundNetworkProximityBps({
      sharedIlliquidAssetBps: 0,
      investorOverlapBps: 0,
      commonServiceOrManagerBps: 0,
      valuationMethodSimilarityBps: 0,
    }, [2_500, 2_500, 2_500, 2_499]),
    /PROXIMITY_WEIGHTS_MUST_SUM_10000/,
  );
});
