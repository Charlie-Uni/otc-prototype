import { MAX_BPS } from '../artifact/risk/calc';
import type { SimulationConfig } from '../core/config';
import { TICK_SEC } from '../core/pipeline';
import { redemptionBlockedByGate } from '../controls/gate';
import { planSettlementLiquidity } from '../liquidity/settlement-plan';
import {
  redemptionDecisionPressureBps,
  redemptionRequestPressureBps,
} from '../metrics/redemption';
import type { NetworkModel } from '../network/types';
import type {
  PendingRedemptionReason,
  RedemptionRequestState,
  SimulationState,
} from '../state/types';
import { validateSimulationState } from '../state/validation';
import type {
  InvestorRedemptionIntent,
  QueueRedemptionResult,
  SettlementBatchResult,
} from './types';

function requireSafeNonNegative(value: number, field: string): void {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`INVALID_${field}`);
}

function requestIdFor(intent: InvestorRedemptionIntent): string {
  return `redemption:r${intent.replicateId}:${intent.fundId}:${intent.investorId}:${intent.tick}`;
}

function pendingSharesByHolder(state: SimulationState, fundId: string): Map<string, number> {
  const pending = new Map<string, number>();
  for (const request of state.redemptionRequests) {
    if (request.fundId === fundId && request.status === 'pending') {
      pending.set(
        request.investorId,
        (pending.get(request.investorId) ?? 0) + request.requestedShares,
      );
    }
  }
  return pending;
}

export function queueRedemptionRequestsForFund(
  state: SimulationState,
  network: NetworkModel,
  fundId: string,
  intents: readonly InvestorRedemptionIntent[],
  requestFractionBps: number,
  controlSeed: number,
): QueueRedemptionResult {
  validateSimulationState(state, network);
  if (!Number.isInteger(requestFractionBps) || requestFractionBps <= 0 || requestFractionBps > MAX_BPS) {
    throw new Error('INVALID_REDEMPTION_REQUEST_FRACTION_BPS');
  }
  const fundIndex = state.funds.findIndex(({ fundId: id }) => id === fundId);
  if (fundIndex < 0) throw new Error('UNKNOWN_REDEMPTION_FUND');
  const activeHoldings = state.holderBalances
    .filter((holding) => holding.fundId === fundId && holding.shares > 0)
    .sort((left, right) => left.investorId.localeCompare(right.investorId));
  if (intents.length !== activeHoldings.length) throw new Error('INCOMPLETE_REDEMPTION_INTENT_SET');

  const intentByInvestor = new Map<string, InvestorRedemptionIntent>();
  const intentTicks = new Set<number>();
  for (const intent of intents) {
    if (intent.fundId !== fundId) throw new Error('REDEMPTION_INTENT_FUND_MISMATCH');
    requireSafeNonNegative(intent.replicateId, 'REDEMPTION_INTENT_REPLICATE_ID');
    requireSafeNonNegative(intent.tick, 'REDEMPTION_INTENT_TICK');
    intentTicks.add(intent.tick);
    if (intentByInvestor.has(intent.investorId)) throw new Error('DUPLICATE_REDEMPTION_INTENT');
    intentByInvestor.set(intent.investorId, intent);
  }
  if (intentTicks.size !== 1) throw new Error('REDEMPTION_INTENT_TICK_MISMATCH');
  for (const holding of activeHoldings) {
    if (!intentByInvestor.has(holding.investorId)) throw new Error('INCOMPLETE_REDEMPTION_INTENT_SET');
  }

  const next = structuredClone(state);
  const existingRequestIds = new Set(next.redemptionRequests.map(({ requestId }) => requestId));
  const pendingByInvestor = pendingSharesByHolder(state, fundId);
  const newRequests: RedemptionRequestState[] = [];
  let redeemingInvestorCount = 0;
  let blockedByGateInvestorCount = 0;
  let requestedShares = 0;
  let blockedSharesByGate = 0;

  for (const holding of activeHoldings) {
    const intent = intentByInvestor.get(holding.investorId)!;
    if (!intent.redeem) continue;
    redeemingInvestorCount += 1;
    const availableShares = holding.shares - (pendingByInvestor.get(holding.investorId) ?? 0);
    if (availableShares <= 0) continue;
    const shares = Math.max(
      1,
      Number((BigInt(availableShares) * BigInt(requestFractionBps)) / BigInt(MAX_BPS)),
    );
    const requestId = requestIdFor(intent);
    const candidate: RedemptionRequestState = {
      requestId,
      replicateId: intent.replicateId,
      fundId,
      investorId: holding.investorId,
      tick: intent.tick,
      requestedAt: state.nowSec,
      requestedShares: shares,
      status: 'pending',
      pendingReason: 'queued',
      settledAt: null,
      settlementAmount: null,
      settlementNavPerShareBps: null,
      fireSaleDiscountLoss: null,
    };
    if (
      state.funds[fundIndex]!.gated
      && redemptionBlockedByGate(
        candidate,
        state.funds[fundIndex]!.gatePhiBps,
        controlSeed,
      )
    ) {
      blockedByGateInvestorCount += 1;
      blockedSharesByGate += shares;
      continue;
    }
    if (existingRequestIds.has(requestId)) throw new Error('DUPLICATE_REDEMPTION_REQUEST_ID');
    existingRequestIds.add(requestId);
    requestedShares += shares;
    newRequests.push(candidate);
  }

  next.redemptionRequests.push(...newRequests);
  const fund = next.funds[fundIndex]!;
  fund.queuedRedemptionShares += requestedShares;
  fund.cumulativeRequestedShares += requestedShares;
  validateSimulationState(next, network);

  return {
    state: next,
    summary: {
      fundId,
      eligibleInvestorCount: activeHoldings.length,
      redeemingInvestorCount,
      blockedByGateInvestorCount,
      decisionPressureBps: redemptionDecisionPressureBps(
        redeemingInvestorCount,
        activeHoldings.length,
      ),
      requestedShares,
      blockedSharesByGate,
      latentRequestedShares: requestedShares + blockedSharesByGate,
      requestPressureBps: redemptionRequestPressureBps(
        requestedShares,
        state.funds[fundIndex]!.totalShares,
      ),
      requestIds: newRequests.map(({ requestId }) => requestId),
    },
  };
}

function markPending(request: RedemptionRequestState, reason: PendingRedemptionReason): void {
  request.pendingReason = reason;
}

export function settlePendingRedemptions(
  state: SimulationState,
  network: NetworkModel,
  config: SimulationConfig,
): SettlementBatchResult {
  validateSimulationState(state, network);
  const next = structuredClone(state);
  const pendingIndexes = next.redemptionRequests
    .map((request, index) => ({ request, index }))
    .filter(({ request }) => request.status === 'pending')
    .sort((left, right) => (
      left.request.requestedAt - right.request.requestedAt
      || left.request.requestId.localeCompare(right.request.requestId)
    ))
    .map(({ index }) => index);
  let settledRequestCount = 0;
  let settledShares = 0;
  let settlementAmountTotal = 0;
  let fireSaleDiscountLoss = 0;

  for (const requestIndex of pendingIndexes) {
    const request = next.redemptionRequests[requestIndex]!;
    const fund = next.funds.find(({ fundId }) => fundId === request.fundId)!;
    if (
      fund.gated
      && redemptionBlockedByGate(request, fund.gatePhiBps, config.control.seed)
    ) {
      markPending(request, 'gated');
      continue;
    }
    const eligibleAt = request.requestedAt
      + config.liquidity.baselineSettlementDelayDays * TICK_SEC;
    if (next.nowSec < eligibleAt) {
      markPending(request, 'settlement_delay');
      continue;
    }
    if (request.requestedShares >= fund.totalShares) {
      markPending(request, 'fund_closure_out_of_scope');
      continue;
    }
    const settlementNavPerShareBps = fund.reportedNavPerShareBps;
    const settlementAmount = Number(
      (BigInt(request.requestedShares) * BigInt(settlementNavPerShareBps))
        / BigInt(MAX_BPS),
    );
    if (settlementAmount === 0) {
      markPending(request, 'settlement_amount_rounds_to_zero');
      continue;
    }
    const plan = planSettlementLiquidity(
      next,
      network,
      request.fundId,
      settlementAmount,
      config.liquidity,
    );
    if (!plan) {
      markPending(request, 'insufficient_liquidity');
      continue;
    }
    const holding = next.holderBalances.find((candidate) => (
      candidate.fundId === request.fundId && candidate.investorId === request.investorId
    ));
    if (!holding || holding.shares < request.requestedShares) {
      throw new Error('REDEMPTION_SETTLEMENT_EXCEEDS_HOLDING');
    }

    next.assetPositions = plan.assetPositions;
    holding.shares -= request.requestedShares;
    fund.totalShares -= request.requestedShares;
    fund.queuedRedemptionShares -= request.requestedShares;
    fund.cumulativeSettledShares += request.requestedShares;
    fund.cumulativeSettlementAmount += settlementAmount;
    fund.cumulativeFireSaleDiscountLoss += plan.fireSaleDiscountLoss;
    fund.economicAum -= settlementAmount + plan.fireSaleDiscountLoss;
    fund.reportedAum -= settlementAmount;
    fund.reportedNavPerShareBps = Number(
      (BigInt(fund.reportedAum) * BigInt(MAX_BPS)) / BigInt(fund.totalShares),
    );

    request.status = 'settled';
    request.pendingReason = null;
    request.settledAt = next.nowSec;
    request.settlementAmount = settlementAmount;
    request.settlementNavPerShareBps = settlementNavPerShareBps;
    request.fireSaleDiscountLoss = plan.fireSaleDiscountLoss;
    next.assetSales.push(...plan.sales.map((sale, index) => ({
      saleId: `${request.requestId}:sale:${index}`,
      requestId: request.requestId,
      fundId: request.fundId,
      occurredAt: next.nowSec,
      ...sale,
    })));
    settledRequestCount += 1;
    settledShares += request.requestedShares;
    settlementAmountTotal += settlementAmount;
    fireSaleDiscountLoss += plan.fireSaleDiscountLoss;
  }

  validateSimulationState(next, network);
  const remainingPending = next.redemptionRequests.filter(({ status }) => status === 'pending');
  const pendingByReason: SettlementBatchResult['summary']['pendingByReason'] = {};
  for (const request of remainingPending) {
    pendingByReason[request.pendingReason!] = (pendingByReason[request.pendingReason!] ?? 0) + 1;
  }
  return {
    state: next,
    summary: {
      attemptedRequestCount: pendingIndexes.length,
      settledRequestCount,
      settledShares,
      settlementAmount: settlementAmountTotal,
      fireSaleDiscountLoss,
      pendingRequestCount: remainingPending.length,
      pendingByReason,
    },
  };
}
