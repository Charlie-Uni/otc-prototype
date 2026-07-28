import assert from 'node:assert/strict';
import test from 'node:test';
import { assertFundBinding } from './chain-config';

const fundId = `0x${'1'.repeat(64)}` as const;
const otherFundId = `0x${'2'.repeat(64)}` as const;
const navRegistry = '0x1111111111111111111111111111111111111111' as const;
const otherNavRegistry = '0x2222222222222222222222222222222222222222' as const;

test('accepts matching on-chain fund and NAV registry binding', () => {
  assert.doesNotThrow(() => assertFundBinding({
    expectedFundId: fundId,
    actualFundId: fundId,
    expectedNavRegistry: navRegistry,
    actualNavRegistry: navRegistry,
  }));
});

test('rejects a fundId mismatch before the API starts', () => {
  assert.throws(() => assertFundBinding({
    expectedFundId: fundId,
    actualFundId: otherFundId,
    expectedNavRegistry: navRegistry,
    actualNavRegistry: navRegistry,
  }), /FUND_ID_MISMATCH/);
});

test('rejects a NAV registry mismatch before the API starts', () => {
  assert.throws(() => assertFundBinding({
    expectedFundId: fundId,
    actualFundId: fundId,
    expectedNavRegistry: navRegistry,
    actualNavRegistry: otherNavRegistry,
  }), /NAV_REGISTRY_MISMATCH/);
});
