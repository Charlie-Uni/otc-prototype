import assert from 'node:assert/strict';
import test from 'node:test';
import {
  redemptionDecisionPressureBps,
  redemptionRequestPressureBps,
} from './redemption';

test('keeps investor-decision and share-request pressure as separate measures', () => {
  assert.equal(redemptionDecisionPressureBps(2, 20), 1_000);
  assert.equal(redemptionRequestPressureBps(30_000, 100_000), 3_000);
});

test('bounds pressure and supports a zero numerator', () => {
  assert.equal(redemptionDecisionPressureBps(0, 20), 0);
  assert.equal(redemptionDecisionPressureBps(20, 20), 10_000);
  assert.throws(
    () => redemptionDecisionPressureBps(21, 20),
    /REDEEMING_INVESTORS_EXCEED_ELIGIBLE_COUNT/,
  );
});

test('rejects invalid pressure inputs', () => {
  assert.throws(
    () => redemptionDecisionPressureBps(1, 0),
    /INVALID_ELIGIBLE_INVESTOR_COUNT/,
  );
  assert.throws(
    () => redemptionRequestPressureBps(-1, 100),
    /INVALID_REDEMPTION_PRESSURE_NUMERATOR/,
  );
});
