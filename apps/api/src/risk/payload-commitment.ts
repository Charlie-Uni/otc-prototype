import { encodeAbiParameters, keccak256, type Address, type Hex } from 'viem';
import type { RiskMetrics } from './calc';
import type { SourceFreshness } from './source-freshness';

export const RISK_PAYLOAD_SCHEMA_VERSION = 3;
export const STALE_REFERENCE_USED = 'storedAt' as const;

type CommittedSourceSnapshot = {
  occurredAt: number;
  submittedAt: number;
  payloadHash: Hex;
  freshness: SourceFreshness;
};

export type RiskPayloadV3Input = {
  chainId: number;
  riskRegistryAddress: Address;
  fundId: Hex;
  snapshotBlockNumber: bigint;
  snapshotBlockTimestamp: number;
  occurredAt: number;
  valuationHaircutBps: number;
  redemptionPressureBps: number;
  redemptionQueueRatioBps: number;
  liquidityBufferRatioBps: number;
  lastValuationAsOf: number;
  lastValuationStoredAt: number;
  holderSharesBps: number[];
  metrics: RiskMetrics;
  weightsConfigId: number;
  maxStaleAgeSec: number;
  weightsHash: Hex;
  valuationHaircut: CommittedSourceSnapshot;
  liquidityBuffer: CommittedSourceSnapshot;
};

// Field order and integer widths are the canonical serialization for payload schema v3.
export function riskPayloadHashV3(input: RiskPayloadV3Input): Hex {
  return keccak256(encodeAbiParameters(
    [
      { name: 'payloadSchemaVersion', type: 'uint16' },
      { name: 'chainId', type: 'uint256' },
      { name: 'riskRegistry', type: 'address' },
      { name: 'fundId', type: 'bytes32' },
      { name: 'snapshotBlockNumber', type: 'uint256' },
      { name: 'snapshotBlockTimestamp', type: 'uint64' },
      { name: 'occurredAt', type: 'uint64' },
      { name: 'valuationHaircutBps', type: 'uint16' },
      { name: 'redemptionPressureBps', type: 'uint16' },
      { name: 'redemptionQueueRatioBps', type: 'uint16' },
      { name: 'liquidityBufferRatioBps', type: 'uint256' },
      { name: 'lastValuationAsOf', type: 'uint64' },
      { name: 'lastValuationStoredAt', type: 'uint64' },
      { name: 'staleReferenceUsed', type: 'string' },
      { name: 'holderSharesBps', type: 'uint16[]' },
      { name: 'valuationHaircutMetricBps', type: 'uint16' },
      { name: 'redemptionPressureMetricBps', type: 'uint16' },
      { name: 'redemptionQueueRatioMetricBps', type: 'uint16' },
      { name: 'liquidityShortfallMetricBps', type: 'uint16' },
      { name: 'stalePricingRiskMetricBps', type: 'uint16' },
      { name: 'investorConcentrationMetricBps', type: 'uint16' },
      { name: 'weightsConfigId', type: 'uint64' },
      { name: 'maxStaleAgeSec', type: 'uint64' },
      { name: 'weightsHash', type: 'bytes32' },
      { name: 'valuationHaircutOccurredAt', type: 'uint64' },
      { name: 'valuationHaircutSubmittedAt', type: 'uint64' },
      { name: 'valuationHaircutPayloadHash', type: 'bytes32' },
      { name: 'valuationHaircutAgeSec', type: 'uint64' },
      { name: 'valuationHaircutFreshnessStatus', type: 'string' },
      { name: 'liquidityBufferOccurredAt', type: 'uint64' },
      { name: 'liquidityBufferSubmittedAt', type: 'uint64' },
      { name: 'liquidityBufferPayloadHash', type: 'bytes32' },
      { name: 'liquidityBufferAgeSec', type: 'uint64' },
      { name: 'liquidityBufferFreshnessStatus', type: 'string' },
    ],
    [
      RISK_PAYLOAD_SCHEMA_VERSION,
      BigInt(input.chainId),
      input.riskRegistryAddress,
      input.fundId,
      input.snapshotBlockNumber,
      BigInt(input.snapshotBlockTimestamp),
      BigInt(input.occurredAt),
      input.valuationHaircutBps,
      input.redemptionPressureBps,
      input.redemptionQueueRatioBps,
      BigInt(input.liquidityBufferRatioBps),
      BigInt(input.lastValuationAsOf),
      BigInt(input.lastValuationStoredAt),
      STALE_REFERENCE_USED,
      input.holderSharesBps,
      input.metrics.valuationHaircutBps,
      input.metrics.redemptionPressureBps,
      input.metrics.redemptionQueueRatioBps,
      input.metrics.liquidityShortfallBps,
      input.metrics.stalePricingRiskBps,
      input.metrics.investorConcentrationBps,
      BigInt(input.weightsConfigId),
      BigInt(input.maxStaleAgeSec),
      input.weightsHash,
      BigInt(input.valuationHaircut.occurredAt),
      BigInt(input.valuationHaircut.submittedAt),
      input.valuationHaircut.payloadHash,
      BigInt(input.valuationHaircut.freshness.ageSec),
      input.valuationHaircut.freshness.status,
      BigInt(input.liquidityBuffer.occurredAt),
      BigInt(input.liquidityBuffer.submittedAt),
      input.liquidityBuffer.payloadHash,
      BigInt(input.liquidityBuffer.freshness.ageSec),
      input.liquidityBuffer.freshness.status,
    ],
  ));
}
