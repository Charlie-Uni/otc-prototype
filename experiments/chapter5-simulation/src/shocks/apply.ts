import type { NetworkModel } from '../network/types';
import type { SimulationState } from '../state/types';
import type { ShockScenario } from './scenario';
import { applyLiquidityShock } from './liquidity';
import { applyRedemptionShock } from './redemption';
import { applyValuationShock } from './valuation';

export function applyShock(
  state: SimulationState,
  network: NetworkModel,
  scenario: ShockScenario,
): SimulationState {
  if (scenario.shockType === 'valuation') return applyValuationShock(state, network, scenario);
  if (scenario.shockType === 'liquidity') return applyLiquidityShock(state, network, scenario);
  return applyRedemptionShock(state, network, scenario);
}
