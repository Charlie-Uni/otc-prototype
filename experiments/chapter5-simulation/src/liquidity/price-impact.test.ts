import assert from 'node:assert/strict';
import test from 'node:test';
import { discountedSaleProceeds, priceImpactBps } from './price-impact';

const baseline = { lambdaBps: 1_000, gamma: 1 };

test('implements the mentor-confirmed price-impact equation', () => {
  assert.equal(priceImpactBps(0, 1_000, baseline), 0);
  assert.equal(priceImpactBps(100, 1_000, baseline), 100);
  assert.equal(priceImpactBps(500, 1_000, baseline), 500);
  assert.equal(discountedSaleProceeds(100, 1_000, baseline), 99);
});

test('impact rises with sale size and falls with market depth', () => {
  assert.ok(priceImpactBps(200, 1_000, baseline) > priceImpactBps(100, 1_000, baseline));
  assert.ok(priceImpactBps(100, 2_000, baseline) < priceImpactBps(100, 1_000, baseline));
  assert.ok(discountedSaleProceeds(100, 1_000, baseline) <= 100);
});

test('supports the nonlinear gamma robustness dimension', () => {
  assert.equal(priceImpactBps(500, 1_000, { lambdaBps: 1_000, gamma: 2 }), 250);
});

test('rejects unsafe amounts and malformed parameters', () => {
  assert.throws(() => priceImpactBps(-1, 1_000, baseline), /INVALID_SALE_AMOUNT/);
  assert.throws(() => priceImpactBps(1, 0, baseline), /INVALID_MARKET_DEPTH/);
  assert.throws(
    () => priceImpactBps(1, 1_000, { lambdaBps: 10_000, gamma: 1 }),
    /INVALID_PRICE_IMPACT_LAMBDA_BPS/,
  );
  assert.throws(
    () => priceImpactBps(1, 1_000, { lambdaBps: 1_000, gamma: 0 }),
    /INVALID_PRICE_IMPACT_GAMMA/,
  );
});
