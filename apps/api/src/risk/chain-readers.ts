import type { Address, Hex } from 'viem';
import { ENV } from '../env';
import { fundId, liquidityRiskRegistry, nav, riskRegistry, rpc, token } from '../chain';
import type { RiskMetrics } from './calc';
import { readHolderShareSnapshot, type HolderShareSnapshot } from './holdings';
import {
  readRedemptionPressureSnapshot,
  type RedemptionPressureSnapshot,
} from './redemptions';
import { STALE_REFERENCE_USED } from './payload-commitment';
import type { RiskSnapshotContext } from './snapshot-context';
import { evaluateSourceFreshness, type SourceFreshness } from './source-freshness';

export type RiskSubmitInput = {
  occurredAt: number;
};

export type WeightsConfig = {
  id: number;
  maxStaleAgeSec: number;
  weightsHash: Hex;
};

export type ResolvedRiskInput = RiskSubmitInput & {
  valuationHaircutBps: number;
  holderSharesBps: number[];
  redemptionPressureBps: number;
  redemptionQueueRatioBps: number;
  liquidityBufferRatioBps: number;
  lastValuationAsOf: number;
  lastValuationStoredAt: number;
};

export type OracleSourceSnapshot = {
  occurredAt: number;
  submittedAt: number;
  payloadHash: Hex;
  submittedBy: Address;
};

export type ValuationHaircutState = {
  valuationHaircutBps: number;
  valuationHaircutSource: 'chain';
  valuationHaircutFreshness: SourceFreshness;
  valuationHaircutSnapshot: OracleSourceSnapshot & {
    valuationHaircutBps: number;
  };
};

export type LiquidityBufferState = {
  liquidityBufferRatioBps: number;
  liquidityBufferSource: 'chain';
  liquidityBufferFreshness: SourceFreshness;
  liquidityBufferSnapshot: OracleSourceSnapshot & {
    liquidityBufferRatioBps: number;
  };
};

export type HolderState = {
  holderSharesBps: number[];
  holderSource: 'chain';
  holderSnapshot: HolderShareSnapshot;
};

export type RedemptionPressureState = {
  redemptionPressureBps: number;
  redemptionPressureSource: 'chain';
  redemptionPressureSnapshot: RedemptionPressureSnapshot;
};

export type RedemptionQueueState = {
  redemptionQueueRatioBps: number;
  redemptionQueueSource: 'chain';
};

export type ValuationTimingState = {
  lastValuationUpdateAt: number;
  lastValuationAsOf: number;
  lastValuationStoredAt: number;
  staleAgeFromAsOfSec: number;
  staleAgeFromStoredAtSec: number;
  staleReferenceUsed: typeof STALE_REFERENCE_USED;
  stalePricingSource: 'chain';
};

export type ResolvedRiskStates = {
  resolvedInput: ResolvedRiskInput;
  valuationState: ValuationHaircutState;
  holderState: HolderState;
  pressureState: RedemptionPressureState;
  queueState: RedemptionQueueState;
  liquidityState: LiquidityBufferState;
  staleState: ValuationTimingState;
};

export type RiskSnapshot = {
  fundId: Hex;
  metrics: RiskMetrics;
  riskScoreBps: number;
  kappaBps: number;
  weightsConfigId: number;
  occurredAt: number;
  submittedAt: number;
  metricsHash: Hex;
  payloadHash: Hex;
  submittedBy: Address;
};

type RawRiskMetrics = {
  valuationHaircutBps: number;
  redemptionPressureBps: number;
  redemptionQueueRatioBps: number;
  liquidityShortfallBps: number;
  stalePricingRiskBps: number;
  investorConcentrationBps: number;
};

type RawRiskSnapshot = {
  fundId: Hex;
  metrics: RawRiskMetrics;
  riskScoreBps: number;
  kappaBps: number;
  weightsConfigId: bigint;
  occurredAt: bigint;
  submittedAt: bigint;
  metricsHash: Hex;
  payloadHash: Hex;
  submittedBy: Address;
};

function normalizeMetrics(raw: RawRiskMetrics): RiskMetrics {
  return {
    valuationHaircutBps: Number(raw.valuationHaircutBps),
    redemptionPressureBps: Number(raw.redemptionPressureBps),
    redemptionQueueRatioBps: Number(raw.redemptionQueueRatioBps),
    liquidityShortfallBps: Number(raw.liquidityShortfallBps),
    stalePricingRiskBps: Number(raw.stalePricingRiskBps),
    investorConcentrationBps: Number(raw.investorConcentrationBps),
  };
}

function normalizeSnapshot(raw: RawRiskSnapshot): RiskSnapshot {
  return {
    fundId: raw.fundId,
    metrics: normalizeMetrics(raw.metrics),
    riskScoreBps: Number(raw.riskScoreBps),
    kappaBps: Number(raw.kappaBps),
    weightsConfigId: Number(raw.weightsConfigId),
    occurredAt: Number(raw.occurredAt),
    submittedAt: Number(raw.submittedAt),
    metricsHash: raw.metricsHash,
    payloadHash: raw.payloadHash,
    submittedBy: raw.submittedBy,
  };
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function captureRiskSnapshotContext(): Promise<RiskSnapshotContext> {
  const [block, chainId] = await Promise.all([
    rpc.getBlock({ blockTag: 'latest' }),
    rpc.getChainId(),
  ]);
  if (block.number === null) {
    throw new Error('SNAPSHOT_BLOCK_NUMBER_UNAVAILABLE');
  }
  return {
    chainId,
    blockNumber: block.number,
    blockTimestamp: Number(block.timestamp),
  };
}

export async function readActiveWeightsConfig(
  context: RiskSnapshotContext,
): Promise<WeightsConfig> {
  const activeId = Number(
    await riskRegistry.read.activeWeightsConfigId({ blockNumber: context.blockNumber }),
  );
  const [, maxStaleAgeRaw, weightsHash, exists] = await riskRegistry.read.getWeightsConfig(
    [BigInt(activeId)],
    { blockNumber: context.blockNumber },
  );
  if (!exists) {
    throw new Error('ACTIVE_WEIGHTS_NOT_FOUND');
  }
  return {
    id: activeId,
    maxStaleAgeSec: Number(maxStaleAgeRaw),
    weightsHash,
  };
}

async function resolveHolderState(context: RiskSnapshotContext): Promise<HolderState> {
  const holderSnapshot = await readHolderShareSnapshot(context.blockNumber);
  return {
    holderSharesBps: holderSnapshot.holderSharesBps,
    holderSource: 'chain',
    holderSnapshot,
  };
}

async function resolveRedemptionQueueState(
  context: RiskSnapshotContext,
): Promise<RedemptionQueueState> {
  return {
    redemptionQueueRatioBps: Number(
      await token.read.redemptionQueueRatioBps({ blockNumber: context.blockNumber }),
    ),
    redemptionQueueSource: 'chain',
  };
}

async function resolveRedemptionPressureState(
  input: RiskSubmitInput,
  context: RiskSnapshotContext,
): Promise<RedemptionPressureState> {
  const redemptionPressureSnapshot = await readRedemptionPressureSnapshot(
    input.occurredAt,
    ENV.REDEMPTION_PRESSURE_WINDOW_SEC,
    context.blockNumber,
  );
  return {
    redemptionPressureBps: redemptionPressureSnapshot.redemptionPressureBps,
    redemptionPressureSource: 'chain',
    redemptionPressureSnapshot,
  };
}

async function resolveValuationTimingState(
  input: RiskSubmitInput,
  context: RiskSnapshotContext,
): Promise<ValuationTimingState> {
  const latestNAV = await nav.read.latestNAV(
    [fundId],
    { blockNumber: context.blockNumber },
  );
  const asOf = Number(latestNAV[3]);
  const storedAt = Number(latestNAV[4]);
  if (storedAt > input.occurredAt) {
    throw new Error('NAV_STORED_AFTER_OCCURRED_AT');
  }
  if (asOf > input.occurredAt) {
    throw new Error('NAV_AS_OF_AFTER_OCCURRED_AT');
  }
  return {
    lastValuationUpdateAt: storedAt,
    lastValuationAsOf: asOf,
    lastValuationStoredAt: storedAt,
    staleAgeFromAsOfSec: input.occurredAt - asOf,
    staleAgeFromStoredAtSec: input.occurredAt - storedAt,
    staleReferenceUsed: STALE_REFERENCE_USED,
    stalePricingSource: 'chain',
  };
}

async function resolveValuationHaircutState(
  input: RiskSubmitInput,
  context: RiskSnapshotContext,
): Promise<ValuationHaircutState> {
  const latest = await nav.read.latestValuationHaircut(
    [fundId],
    { blockNumber: context.blockNumber },
  );
  const valuationHaircutSnapshot = {
    valuationHaircutBps: Number(latest[0]),
    occurredAt: Number(latest[1]),
    submittedAt: Number(latest[2]),
    payloadHash: latest[3],
    submittedBy: latest[4],
  };
  if (valuationHaircutSnapshot.occurredAt > input.occurredAt) {
    throw new Error('VALUATION_HAIRCUT_OCCURRED_AFTER_RISK');
  }
  return {
    valuationHaircutBps: valuationHaircutSnapshot.valuationHaircutBps,
    valuationHaircutSource: 'chain',
    valuationHaircutFreshness: evaluateSourceFreshness(
      input.occurredAt,
      valuationHaircutSnapshot.occurredAt,
      ENV.MAX_VALUATION_HAIRCUT_AGE_SEC,
    ),
    valuationHaircutSnapshot,
  };
}

async function resolveLiquidityBufferState(
  input: RiskSubmitInput,
  context: RiskSnapshotContext,
): Promise<LiquidityBufferState> {
  const latest = await liquidityRiskRegistry.read.latestLiquidityBuffer(
    [fundId],
    { blockNumber: context.blockNumber },
  );
  const liquidityBufferSnapshot = {
    liquidityBufferRatioBps: Number(latest[0]),
    occurredAt: Number(latest[1]),
    submittedAt: Number(latest[2]),
    payloadHash: latest[3],
    submittedBy: latest[4],
  };
  if (liquidityBufferSnapshot.occurredAt > input.occurredAt) {
    throw new Error('LIQUIDITY_BUFFER_OCCURRED_AFTER_RISK');
  }
  return {
    liquidityBufferRatioBps: liquidityBufferSnapshot.liquidityBufferRatioBps,
    liquidityBufferSource: 'chain',
    liquidityBufferFreshness: evaluateSourceFreshness(
      input.occurredAt,
      liquidityBufferSnapshot.occurredAt,
      ENV.MAX_LIQUIDITY_BUFFER_AGE_SEC,
    ),
    liquidityBufferSnapshot,
  };
}

export async function resolveRiskStates(
  input: RiskSubmitInput,
  context: RiskSnapshotContext,
): Promise<ResolvedRiskStates> {
  const [valuationState, holderState, pressureState, queueState, liquidityState, staleState] =
    await Promise.all([
      resolveValuationHaircutState(input, context),
      resolveHolderState(context),
      resolveRedemptionPressureState(input, context),
      resolveRedemptionQueueState(context),
      resolveLiquidityBufferState(input, context),
      resolveValuationTimingState(input, context),
    ]);

  return {
    resolvedInput: {
      ...input,
      valuationHaircutBps: valuationState.valuationHaircutBps,
      holderSharesBps: holderState.holderSharesBps,
      redemptionPressureBps: pressureState.redemptionPressureBps,
      redemptionQueueRatioBps: queueState.redemptionQueueRatioBps,
      liquidityBufferRatioBps: liquidityState.liquidityBufferRatioBps,
      lastValuationAsOf: staleState.lastValuationAsOf,
      lastValuationStoredAt: staleState.lastValuationStoredAt,
    },
    valuationState,
    holderState,
    pressureState,
    queueState,
    liquidityState,
    staleState,
  };
}

export async function readRiskSnapshotAt(index: number | bigint): Promise<RiskSnapshot> {
  const snapshot = await riskRegistry.read.snapshotAt([fundId, BigInt(index)]);
  return normalizeSnapshot(snapshot);
}

export async function readLatestRiskSnapshot(): Promise<RiskSnapshot | null> {
  try {
    const snapshot = await riskRegistry.read.latestSnapshot([fundId]);
    return normalizeSnapshot(snapshot);
  } catch (error) {
    if (messageOf(error).includes('NO_RISK_SNAPSHOT')) {
      return null;
    }
    throw error;
  }
}

export async function readRiskHistoryLength(): Promise<number> {
  return Number(await riskRegistry.read.historyLength([fundId]));
}

export async function readCurrentGateState(): Promise<boolean> {
  return Boolean(await riskRegistry.read.isGated([fundId]));
}
