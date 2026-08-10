import type { SimulationConfig } from '../core/config';
import { generateNetworkModel } from '../network/generator';
import type { FundNode, NetworkModel } from '../network/types';
import type { SimulationRunResult, TickTrace } from '../runner/types';
import { semanticDigestSha256 } from '../runner/digest';
import type { RedemptionRequestState } from '../state/types';
import { detectionLagMetrics } from './detection';
import {
  arithmeticMean,
  integerMedian,
  nearestRankPercentile,
  outcomeWindowEndAt,
  ratioBps,
} from './math';
import type {
  FundRunOutcome,
  RunOutcomeMetrics,
  SettlementDelaySummary,
} from './outcome-types';

function assertRunMatchesNetwork(result: SimulationRunResult, network: NetworkModel): void {
  const resultFundIds = new Set(result.finalState.funds.map(({ fundId }) => fundId));
  if (
    resultFundIds.size !== network.funds.length
    || network.funds.some(({ id }) => !resultFundIds.has(id))
  ) throw new Error('METRIC_NETWORK_RUN_MISMATCH');
}

function requestsInWindow(
  result: SimulationRunResult,
  fundId: string,
  windowEndAt: number,
): RedemptionRequestState[] {
  return result.finalState.redemptionRequests.filter((request) => (
    request.fundId === fundId
    && request.requestedAt >= result.scenario.shockAt
    && request.requestedAt < windowEndAt
  ));
}

function tracesInWindow(result: SimulationRunResult, windowEndAt: number): TickTrace[] {
  return result.traces.filter(({ decisionAt }) => (
    decisionAt >= result.scenario.shockAt && decisionAt < windowEndAt
  ));
}

function settlementDelaySummary(
  requests: readonly RedemptionRequestState[],
  windowEndAt: number,
): SettlementDelaySummary {
  const delays = requests
    .filter((request) => request.settledAt !== null && request.settledAt < windowEndAt)
    .map((request) => request.settledAt! - request.requestedAt);
  return {
    settledRequestCount: delays.length,
    meanSec: arithmeticMean(delays),
    medianSec: integerMedian(delays),
    p95Sec: nearestRankPercentile(delays, 95),
  };
}

function lastFundTrace(
  traces: readonly TickTrace[],
  fundId: string,
): TickTrace['funds'][number] {
  const value = traces.at(-1)?.funds.find((fund) => fund.fundId === fundId);
  if (!value) throw new Error('MISSING_FUND_TRACE_IN_METRIC_WINDOW');
  return value;
}

function fundOutcome(
  result: SimulationRunResult,
  initial: FundNode,
  traces: readonly TickTrace[],
  windowDays: number,
  windowEndAt: number,
  baselineSettlementDelayDays: number,
): FundRunOutcome {
  const requests = requestsInWindow(result, initial.id, windowEndAt);
  const cumulativeRequestedShares = requests.reduce(
    (sum, request) => sum + request.requestedShares,
    0,
  );
  const fundQueues = traces.flatMap(({ queues }) => queues.filter(({ fundId }) => (
    fundId === initial.id
  )));
  const cumulativeLatentRequestedShares = fundQueues.reduce(
    (sum, queue) => sum + queue.latentRequestedShares,
    0,
  );
  const blockedSharesByGate = fundQueues.reduce(
    (sum, queue) => sum + queue.blockedSharesByGate,
    0,
  );
  const settled = requests.filter((request) => (
    request.settledAt !== null && request.settledAt < windowEndAt
  ));
  const pending = requests.filter((request) => (
    request.settledAt === null || request.settledAt >= windowEndAt
  ));
  const pendingShares = pending.reduce((sum, request) => sum + request.requestedShares, 0);
  const settlementOutflow = settled.reduce(
    (sum, request) => sum + request.settlementAmount!,
    0,
  );
  const delays = settled.map((request) => request.settledAt! - request.requestedAt);
  const baselineDelaySec = baselineSettlementDelayDays * 86_400;
  const extraWaits = delays.map((delay) => Math.max(0, delay - baselineDelaySec));
  const last = lastFundTrace(traces, initial.id);
  const adjustedEndingAum = last.economicAum + settlementOutflow;
  const lossAmount = Math.max(0, initial.initialAum - adjustedEndingAum);
  const initialBuffer = initial.liquidityBufferRatioBps;
  const fundTraces = traces.map((trace) => (
    trace.funds.find(({ fundId }) => fundId === initial.id)!
  ));
  const minimumLiquidityBufferRatioBps = Math.min(
    initialBuffer,
    ...fundTraces.map(({ liquidityBufferRatioBps }) => liquidityBufferRatioBps),
  );
  const firstExhaustionTrace = traces.find((trace) => trace.funds.some((fund) => (
    fund.fundId === initial.id && fund.liquidityBufferRatioBps === 0
  )));
  return {
    fundId: initial.id,
    shocked: initial.id === result.scenario.targetFundId,
    windowDays,
    initialAum: initial.initialAum,
    initialTotalShares: initial.initialTotalShares,
    cumulativeRequestedShares,
    cumulativeRequestRateBps: ratioBps(
      cumulativeRequestedShares,
      initial.initialTotalShares,
      'CUMULATIVE_REQUEST_RATE',
    ),
    cumulativeLatentRequestedShares,
    cumulativeLatentRequestRateBps: ratioBps(
      cumulativeLatentRequestedShares,
      initial.initialTotalShares,
      'CUMULATIVE_LATENT_REQUEST_RATE',
    ),
    peakRedemptionBps: Math.max(0, ...fundQueues.map(({ requestPressureBps }) => (
      requestPressureBps
    ))),
    settledShares: settled.reduce((sum, request) => sum + request.requestedShares, 0),
    pendingRequestCount: pending.length,
    pendingShares,
    pendingRateBps: cumulativeRequestedShares === 0
      ? 0
      : ratioBps(pendingShares, cumulativeRequestedShares, 'PENDING_RATE'),
    settlementDelay: settlementDelaySummary(requests, windowEndAt),
    blockedSharesByGate,
    gateFrozenShareRatioBps: cumulativeLatentRequestedShares === 0
      ? 0
      : ratioBps(
        blockedSharesByGate,
        cumulativeLatentRequestedShares,
        'GATE_FROZEN_SHARE_RATIO',
      ),
    totalExtraWaitingSec: extraWaits.reduce((sum, delay) => sum + delay, 0),
    averageExtraWaitingSec: arithmeticMean(extraWaits),
    lossAmount,
    lossMagnitudeBps: ratioBps(lossAmount, initial.initialAum, 'LOSS_MAGNITUDE'),
    fireSaleDiscountLoss: settled.reduce(
      (sum, request) => sum + request.fireSaleDiscountLoss!,
      0,
    ),
    minimumLiquidityBufferRatioBps,
    liquidityBufferDepletionBps: ratioBps(
      Math.max(0, initialBuffer - minimumLiquidityBufferRatioBps),
      initialBuffer,
      'LIQUIDITY_BUFFER_DEPLETION',
    ),
    firstLiquidityBufferExhaustionAt: firstExhaustionTrace?.decisionAt ?? null,
  };
}

export function extractRunOutcomeMetrics(
  result: SimulationRunResult,
  config: SimulationConfig,
  windowDays = config.time.primaryWindowDays,
): RunOutcomeMetrics {
  const network = generateNetworkModel(config);
  if (result.configDigestSha256 !== semanticDigestSha256(config)) {
    throw new Error('METRIC_CONFIG_RUN_MISMATCH');
  }
  assertRunMatchesNetwork(result, network);
  const windowEndAt = outcomeWindowEndAt(
    result.scenario.shockAt,
    windowDays,
    result.horizonDays,
  );
  const traces = tracesInWindow(result, windowEndAt);
  if (traces.length !== windowDays) throw new Error('INCOMPLETE_METRIC_WINDOW');
  return {
    schemaVersion: 1,
    treatmentId: result.treatmentId,
    configDigestSha256: result.configDigestSha256,
    regimeId: result.regime.id,
    replicateId: result.scenario.replicateId,
    scenarioId: result.scenario.scenarioId,
    shockAt: result.scenario.shockAt,
    windowDays,
    detection: detectionLagMetrics(result),
    funds: network.funds.map((initial) => fundOutcome(
      result,
      initial,
      traces,
      windowDays,
      windowEndAt,
      config.liquidity.baselineSettlementDelayDays,
    )),
  };
}
