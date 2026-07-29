import assert from 'node:assert/strict';
import test from 'node:test';
import { riskPayloadHashV3 } from './payload-commitment';

test('risk payload v3 canonical ABI encoding remains stable', () => {
  const payloadHash = riskPayloadHashV3({
    chainId: 31_337,
    riskRegistryAddress: '0x1111111111111111111111111111111111111111',
    fundId: '0x2222222222222222222222222222222222222222222222222222222222222222',
    snapshotBlockNumber: 123n,
    snapshotBlockTimestamp: 1_700_000_000,
    occurredAt: 1_699_999_990,
    valuationHaircutBps: 1_200,
    redemptionPressureBps: 2_300,
    redemptionQueueRatioBps: 3_400,
    liquidityBufferRatioBps: 12_500,
    lastValuationAsOf: 1_699_900_000,
    lastValuationStoredAt: 1_699_990_000,
    holderSharesBps: [4_000, 3_000, 2_000, 1_000],
    metrics: {
      valuationHaircutBps: 1_200,
      redemptionPressureBps: 2_300,
      redemptionQueueRatioBps: 3_400,
      liquidityShortfallBps: 0,
      stalePricingRiskBps: 38,
      investorConcentrationBps: 3_000,
    },
    weightsConfigId: 7,
    maxStaleAgeSec: 2_592_000,
    weightsHash: '0x3333333333333333333333333333333333333333333333333333333333333333',
    valuationHaircut: {
      occurredAt: 1_699_990_000,
      submittedAt: 1_699_990_100,
      payloadHash: '0x4444444444444444444444444444444444444444444444444444444444444444',
      freshness: {
        ageSec: 9_990,
        maxAgeSec: 86_400,
        status: 'fresh',
      },
    },
    liquidityBuffer: {
      occurredAt: 1_699_980_000,
      submittedAt: 1_699_980_100,
      payloadHash: '0x5555555555555555555555555555555555555555555555555555555555555555',
      freshness: {
        ageSec: 19_990,
        maxAgeSec: 86_400,
        status: 'stale_warning',
      },
    },
  });

  assert.equal(
    payloadHash,
    '0x08eac0c8823bfcfe54581b458af3c51e4f82b3eb7f1b6b94eb976096941b4824',
  );
});
