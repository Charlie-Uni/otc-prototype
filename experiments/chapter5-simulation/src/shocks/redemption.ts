import { MAX_BPS } from '../artifact/risk/calc';
import { allocateIntegerProportionally } from '../core/allocation';
import type { NetworkModel } from '../network/types';
import type { RedemptionRequestState, SimulationState } from '../state/types';
import { validateSimulationState } from '../state/validation';
import type { RedemptionShockScenario } from './scenario';

function requireShockAvailable(state: SimulationState, scenario: RedemptionShockScenario): void {
  if (scenario.shockAt !== state.nowSec) throw new Error('SHOCK_TIME_STATE_MISMATCH');
  if (state.appliedValuationShocks.length > 0 || (state.appliedRobustnessShocks?.length ?? 0) > 0) {
    throw new Error('SHOCK_ALREADY_APPLIED');
  }
}

export function applyRedemptionShock(
  state: SimulationState,
  network: NetworkModel,
  scenario: RedemptionShockScenario,
): SimulationState {
  requireShockAvailable(state, scenario);
  const fund = state.funds.find(({ fundId }) => fundId === scenario.targetFundId);
  if (!fund) throw new Error('UNKNOWN_REDEMPTION_SHOCK_FUND');
  const holders = state.holderBalances
    .filter(({ fundId, shares }) => fundId === scenario.targetFundId && shares > 0)
    .sort((left, right) => left.investorId.localeCompare(right.investorId));
  if (holders.length === 0) throw new Error('NO_HOLDERS_FOR_REDEMPTION_SHOCK');
  const requestedShares = Number(
    (BigInt(fund.totalShares) * BigInt(scenario.redemptionPressureBps)) / BigInt(MAX_BPS),
  );
  if (requestedShares <= 0 || requestedShares >= fund.totalShares) {
    throw new Error('INVALID_REDEMPTION_SHOCK_SHARES');
  }
  const sharesByHolder = allocateIntegerProportionally(
    requestedShares,
    holders.map(({ shares }) => shares),
  );
  const requests: RedemptionRequestState[] = holders.flatMap((holder, index) => {
    const shares = sharesByHolder[index]!;
    if (shares === 0) return [];
    return [{
      requestId: `shock-redemption:r${scenario.replicateId}:${scenario.targetFundId}:${holder.investorId}`,
      replicateId: scenario.replicateId,
      fundId: scenario.targetFundId,
      investorId: holder.investorId,
      tick: 0,
      requestedAt: scenario.shockAt,
      requestedShares: shares,
      status: 'pending' as const,
      pendingReason: 'queued' as const,
      settledAt: null,
      settlementAmount: null,
      settlementNavPerShareBps: null,
      fireSaleDiscountLoss: null,
    }];
  });
  const requestIds = requests.map(({ requestId }) => requestId);
  const next: SimulationState = {
    ...state,
    funds: state.funds.map((candidate) => candidate.fundId === scenario.targetFundId
      ? {
          ...candidate,
          queuedRedemptionShares: candidate.queuedRedemptionShares + requestedShares,
          cumulativeRequestedShares: candidate.cumulativeRequestedShares + requestedShares,
        }
      : candidate),
    redemptionRequests: [...state.redemptionRequests, ...requests],
    appliedRobustnessShocks: [{
      scenarioId: scenario.scenarioId,
      shockType: 'redemption',
      targetFundId: scenario.targetFundId,
      shockAt: scenario.shockAt,
      redemptionPressureBps: scenario.redemptionPressureBps,
      preShockTotalShares: fund.totalShares,
      requestedShares,
      requestIds,
    }],
  };
  validateSimulationState(next, network);
  return next;
}
