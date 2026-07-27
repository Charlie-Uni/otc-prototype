import assert from 'node:assert/strict';
import test from 'node:test';
import { canReadHolderAddress } from './resource-auth';

const investor = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
const other = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC';

test('binds investor balance reads to the configured identity address', () => {
  assert.equal(canReadHolderAddress('investor', investor.toLowerCase(), investor), true);
  assert.equal(canReadHolderAddress('investor', other, investor), false);
});

test('keeps authorized operational roles independent of investor ownership', () => {
  assert.equal(canReadHolderAddress('manager', other, investor), true);
  assert.equal(canReadHolderAddress('regulator', other, investor), true);
});
