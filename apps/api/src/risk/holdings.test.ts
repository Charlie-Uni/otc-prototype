import assert from 'node:assert/strict';
import test from 'node:test';
import { assertHolderRegistryMatchesTotalSupply, balancesToHolderSharesBps } from './holdings';

test('converts holder balances to bps with largest remainder allocation', () => {
  assert.deepEqual(
    balancesToHolderSharesBps([
      { holder: '0x0000000000000000000000000000000000000001', balance: 1n },
      { holder: '0x0000000000000000000000000000000000000002', balance: 1n },
      { holder: '0x0000000000000000000000000000000000000003', balance: 1n },
    ]),
    [3334, 3333, 3333],
  );
});

test('ignores zero balances and preserves exact 10000 total', () => {
  const shares = balancesToHolderSharesBps([
    { holder: '0x0000000000000000000000000000000000000001', balance: 4n },
    { holder: '0x0000000000000000000000000000000000000002', balance: 3n },
    { holder: '0x0000000000000000000000000000000000000003', balance: 2n },
    { holder: '0x0000000000000000000000000000000000000004', balance: 1n },
    { holder: '0x0000000000000000000000000000000000000005', balance: 0n },
  ]);

  assert.deepEqual(shares, [4000, 3000, 2000, 1000]);
  assert.equal(shares.reduce((sum, share) => sum + share, 0), 10_000);
});

test('rejects empty holder state', () => {
  assert.throws(() => balancesToHolderSharesBps([]), /NO_HOLDERS/);
});

test('verifies reconstructed holder registry against latest event totalSupply', () => {
  const totalSupply = assertHolderRegistryMatchesTotalSupply([
    { holder: '0x0000000000000000000000000000000000000001', balance: 4n },
    { holder: '0x0000000000000000000000000000000000000002', balance: 6n },
  ], 10n);

  assert.equal(totalSupply, 10n);
});

test('rejects holder registry when balances do not match latest event totalSupply', () => {
  assert.throws(
    () => assertHolderRegistryMatchesTotalSupply([
      { holder: '0x0000000000000000000000000000000000000001', balance: 4n },
      { holder: '0x0000000000000000000000000000000000000002', balance: 6n },
    ], 9n),
    /HOLDER_REGISTRY_TOTAL_SUPPLY_MISMATCH/,
  );
});
