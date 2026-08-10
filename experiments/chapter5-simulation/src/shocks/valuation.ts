import { MAX_BPS } from '../artifact/risk/calc';
import { allocateIntegerProportionally } from '../core/allocation';
import type { NetworkModel } from '../network/types';
import type { SimulationState } from '../state/types';
import { validateSimulationState } from '../state/validation';
import type { ValuationShockScenario } from './scenario';

export function applyValuationShock(
  state: SimulationState,
  network: NetworkModel,
  scenario: ValuationShockScenario,
): SimulationState {
  if (scenario.shockType !== 'valuation') throw new Error('UNSUPPORTED_SHOCK_TYPE');
  if (state.nowSec !== scenario.shockAt) throw new Error('SHOCK_TIME_STATE_MISMATCH');
  if (scenario.navDropBps <= 0 || scenario.navDropBps >= MAX_BPS) {
    throw new Error('INVALID_VALUATION_SHOCK_MAGNITUDE');
  }
  if (state.appliedValuationShocks.length > 0 || (state.appliedRobustnessShocks?.length ?? 0) > 0) {
    throw new Error('SHOCK_ALREADY_APPLIED');
  }
  const targetFund = state.funds.find(({ fundId }) => fundId === scenario.targetFundId);
  if (!targetFund) throw new Error('UNKNOWN_VALUATION_SHOCK_FUND');

  const assetLiquidity = new Map(network.assetClasses.map(({ id, liquidity }) => [id, liquidity]));
  const targetIlliquidPositions = state.assetPositions.filter(
    ({ fundId, assetClassId }) => (
      fundId === scenario.targetFundId && assetLiquidity.get(assetClassId) === 'illiquid'
    ),
  );
  if (targetIlliquidPositions.length === 0) throw new Error('NO_ILLIQUID_ASSETS_FOR_VALUATION_SHOCK');
  const illiquidValue = targetIlliquidPositions.reduce((sum, position) => sum + position.value, 0);
  const lossAmount = Number(
    (BigInt(targetFund.economicAum) * BigInt(scenario.navDropBps)) / BigInt(MAX_BPS),
  );
  if (lossAmount > illiquidValue) throw new Error('VALUATION_SHOCK_EXCEEDS_ILLIQUID_ASSETS');
  const positionLosses = allocateIntegerProportionally(
    lossAmount,
    targetIlliquidPositions.map(({ value }) => value),
  );
  const lossByPosition = new Map(targetIlliquidPositions.map((position, index) => [
    `${position.fundId}\u0000${position.assetClassId}`,
    positionLosses[index]!,
  ]));
  const postShockEconomicAum = targetFund.economicAum - lossAmount;

  const nextState: SimulationState = {
    ...state,
    funds: state.funds.map((fund) => (
      fund.fundId === scenario.targetFundId
        ? { ...fund, economicAum: postShockEconomicAum }
        : fund
    )),
    assetPositions: state.assetPositions.map((position) => {
      const loss = lossByPosition.get(`${position.fundId}\u0000${position.assetClassId}`) ?? 0;
      return loss === 0 ? position : { ...position, value: position.value - loss };
    }),
    appliedValuationShocks: [
      ...state.appliedValuationShocks,
      {
        scenarioId: scenario.scenarioId,
        targetFundId: scenario.targetFundId,
        shockAt: scenario.shockAt,
        navDropBps: scenario.navDropBps,
        lossAmount,
        preShockEconomicAum: targetFund.economicAum,
        postShockEconomicAum,
      },
    ],
  };
  validateSimulationState(nextState, network);
  return nextState;
}
