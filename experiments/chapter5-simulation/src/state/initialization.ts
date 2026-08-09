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

  const state: SimulationState = {
    schemaVersion: 1,
    nowSec: atSec,
    funds: network.funds.map((fund) => ({
      fundId: fund.id,
      economicAum: fund.initialAum,
      reportedAum: fund.initialAum,
      totalShares: fund.initialTotalShares,
      reportedNavPerShareBps: Math.floor(
        (fund.initialAum * MAX_BPS) / fund.initialTotalShares,
      ),
      queuedRedemptionShares: 0,
      cumulativeRequestedShares: 0,
      cumulativeSettledShares: 0,
      lastValuationUpdateAt: atSec,
      gated: false,
      reportedRiskMetrics: initialRiskMetrics(
        fund.liquidityBufferRatioBps,
        fund.investorConcentrationBps,
      ),
    })),
    assetPositions,
    appliedValuationShocks: [],
  };
  validateSimulationState(state, network);
  return state;
}
