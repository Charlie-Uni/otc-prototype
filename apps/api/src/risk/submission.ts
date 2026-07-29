import type { Hex } from 'viem';
import { ENV } from '../env';
import { fundId, riskRegistry, rpc } from '../chain';
import {
  computeInvestorConcentrationBps,
  computeLiquidityShortfallBps,
  normalizeStalePricingRiskBps,
  type RiskMetrics,
} from './calc';
import {
  captureRiskSnapshotContext,
  readActiveWeightsConfig,
  readRiskSnapshotAt,
  resolveRiskStates,
  type HolderState,
  type LiquidityBufferState,
  type RedemptionPressureState,
  type RedemptionQueueState,
  type ResolvedRiskInput,
  type RiskSnapshot,
  type RiskSubmitInput,
  type ValuationHaircutState,
  type ValuationTimingState,
  type WeightsConfig,
} from './chain-readers';
import { riskPayloadHashV3 } from './payload-commitment';
import { riskSnapshotIdFromReceipt } from './receipt-confirmation';
import { validateRiskSnapshotTime, type RiskSnapshotContext } from './snapshot-context';
import { submitRiskWithOneConfigRetry } from './submit-retry';

export type ComputedRisk = {
  snapshotContext: RiskSnapshotContext;
  config: WeightsConfig;
  metrics: RiskMetrics;
  payloadHash: Hex;
} & ValuationHaircutState
  & HolderState
  & RedemptionPressureState
  & RedemptionQueueState
  & LiquidityBufferState
  & ValuationTimingState;

export type SubmittedRisk = ComputedRisk & {
  tx: Hex;
  snapshot: RiskSnapshot;
  retried: boolean;
};

function buildMetrics(input: ResolvedRiskInput, config: WeightsConfig): RiskMetrics {
  const staleAgeSec = input.occurredAt - input.lastValuationStoredAt;
  return {
    valuationHaircutBps: input.valuationHaircutBps,
    redemptionPressureBps: input.redemptionPressureBps,
    redemptionQueueRatioBps: input.redemptionQueueRatioBps,
    liquidityShortfallBps: computeLiquidityShortfallBps(input.liquidityBufferRatioBps),
    stalePricingRiskBps: normalizeStalePricingRiskBps(staleAgeSec, config.maxStaleAgeSec),
    investorConcentrationBps: computeInvestorConcentrationBps(input.holderSharesBps),
  };
}

async function computeFromChainConfig(input: RiskSubmitInput): Promise<ComputedRisk> {
  const snapshotContext = await captureRiskSnapshotContext();
  validateRiskSnapshotTime(
    input.occurredAt,
    snapshotContext,
    ENV.RISK_INPUT_MAX_AGE_SEC,
  );
  const config = await readActiveWeightsConfig(snapshotContext);
  const states = await resolveRiskStates(input, snapshotContext);
  const metrics = buildMetrics(states.resolvedInput, config);
  const payloadHash = riskPayloadHashV3({
    chainId: snapshotContext.chainId,
    riskRegistryAddress: ENV.RISK_REGISTRY_ADDRESS,
    fundId,
    snapshotBlockNumber: snapshotContext.blockNumber,
    snapshotBlockTimestamp: snapshotContext.blockTimestamp,
    occurredAt: states.resolvedInput.occurredAt,
    valuationHaircutBps: states.resolvedInput.valuationHaircutBps,
    redemptionPressureBps: states.resolvedInput.redemptionPressureBps,
    redemptionQueueRatioBps: states.resolvedInput.redemptionQueueRatioBps,
    liquidityBufferRatioBps: states.resolvedInput.liquidityBufferRatioBps,
    lastValuationAsOf: states.resolvedInput.lastValuationAsOf,
    lastValuationStoredAt: states.resolvedInput.lastValuationStoredAt,
    holderSharesBps: states.resolvedInput.holderSharesBps,
    metrics,
    weightsConfigId: config.id,
    maxStaleAgeSec: config.maxStaleAgeSec,
    weightsHash: config.weightsHash,
    valuationHaircut: {
      occurredAt: states.valuationState.valuationHaircutSnapshot.occurredAt,
      submittedAt: states.valuationState.valuationHaircutSnapshot.submittedAt,
      payloadHash: states.valuationState.valuationHaircutSnapshot.payloadHash,
      freshness: states.valuationState.valuationHaircutFreshness,
    },
    liquidityBuffer: {
      occurredAt: states.liquidityState.liquidityBufferSnapshot.occurredAt,
      submittedAt: states.liquidityState.liquidityBufferSnapshot.submittedAt,
      payloadHash: states.liquidityState.liquidityBufferSnapshot.payloadHash,
      freshness: states.liquidityState.liquidityBufferFreshness,
    },
  });

  return {
    snapshotContext,
    config,
    metrics,
    payloadHash,
    ...states.valuationState,
    ...states.holderState,
    ...states.pressureState,
    ...states.queueState,
    ...states.liquidityState,
    ...states.staleState,
  };
}

export async function submitRisk(input: RiskSubmitInput): Promise<SubmittedRisk> {
  const { computed, tx, snapshot, retried } =
    await submitRiskWithOneConfigRetry<ComputedRisk, RiskSnapshot>({
      compute: () => computeFromChainConfig(input),
      submit: async (batch) => {
        const hash = await riskRegistry.write.submitMetrics([
          fundId,
          batch.metrics,
          BigInt(batch.config.id),
          BigInt(input.occurredAt),
          batch.payloadHash,
        ]);
        await rpc.waitForTransactionReceipt({ hash });
        return hash;
      },
      confirm: async (batch, txHash) => {
        const receipt = await rpc.getTransactionReceipt({ hash: txHash });
        const snapshotId = riskSnapshotIdFromReceipt({
          receipt,
          riskRegistryAddress: ENV.RISK_REGISTRY_ADDRESS,
          fundId,
          payloadHash: batch.payloadHash,
        });
        const stored = await readRiskSnapshotAt(snapshotId);
        if (
          stored.payloadHash !== batch.payloadHash
          || stored.weightsConfigId !== batch.config.id
        ) {
          throw new Error('RISK_SNAPSHOT_CONFIRMATION_FAILED');
        }
        return stored;
      },
    });

  return {
    tx,
    snapshot,
    retried,
    ...computed,
  };
}
