import {
  computeLiquidityShortfallBps,
  MAX_BPS,
  type RiskMetrics,
} from '../artifact/risk/calc';
import { allocateIntegerProportionally } from '../core/allocation';
import type { NetworkModel } from '../network/types';
import type { SimulationState } from './types';
import { validateSimulationState } from './validation';

function initialRiskMetrics(
  liquidityBufferRatioBps: number,
  investorConcentrationBps: number,
): RiskMetrics {
  return {
    valuationHaircutBps: 0,
    redemptionPressureBps: 0,
    redemptionQueueRatioBps: 0,
    liquidityShortfallBps: computeLiquidityShortfallBps(liquidityBufferRatioBps),
    stalePricingRiskBps: 0,
    investorConcentrationBps,
  };
}

export function createInitialSimulationState(network: NetworkModel, atSec: number): SimulationState {
  if (!Number.isSafeInteger(atSec) || atSec < 0) throw new Error('INVALID_INITIAL_STATE_TIME');

  const assetPositions = network.funds.flatMap((fund) => {
    const exposures = network.assetExposures.filter(({ fundId }) => fundId === fund.id);
    const values = allocateIntegerProportionally(
      fund.initialAum,
      exposures.map(({ exposureBps }) => exposureBps),
    );
    return exposures.map(({ fundId, assetClassId }, index) => ({
      fundId,
      assetClassId,
      value: values[index]!,
    }));
  });
  const holderBalances = network.funds.flatMap((fund) => {
    const holdings = network.holdings.filter(({ fundId }) => fundId === fund.id);
    const shares = allocateIntegerProportionally(
      fund.initialTotalShares,
      holdings.map(({ shareBps }) => shareBps),
    );
    return holdings.map(({ fundId, investorId }, index) => ({
      fundId,
      investorId,
      shares: shares[index]!,
    }));
  });

  const state: SimulationState = {
    schemaVersion: 1,
    nowSec: atSec,
    funds: network.funds.map((fund) => ({
      fundId: fund.id,
      economicAum: fund.initialAum,
      reportedAum: fund.initialAum,
      totalShares: fund.initialTotalShares,
      reportedNavPerShareBps: Number(
        (BigInt(fund.initialAum) * BigInt(MAX_BPS)) / BigInt(fund.initialTotalShares),
      ),
      queuedRedemptionShares: 0,
      cumulativeRequestedShares: 0,
      cumulativeSettledShares: 0,
      cumulativeSettlementAmount: 0,
      cumulativeFireSaleDiscountLoss: 0,
      lastValuationAsOf: atSec,
      lastValuationUpdateAt: atSec,
      gated: false,
      gatePhiBps: 0,
      gatedAt: null,
      gateTriggerSubmissionId: null,
      gateReleaseStreakTicks: 0,
      gateReleaseEligibleAtTick: null,
      lastControlSubmissionId: null,
      lastControlEvaluationTick: null,
      reportedRiskMetrics: initialRiskMetrics(
        fund.liquidityBufferRatioBps,
        fund.investorConcentrationBps,
      ),
    })),
    holderBalances,
    assetPositions,
    redemptionRequests: [],
    assetSales: [],
    appliedValuationShocks: [],
    oracleRiskSnapshots: [],
    controlTransitions: [],
    networkPropagations: [],
  };
  validateSimulationState(state, network);
  return state;
}
