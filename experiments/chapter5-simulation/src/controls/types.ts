import type { GateTransitionState, SimulationState } from '../state/types';

export type GateControlStatus = 'triggered' | 'released' | 'unchanged';

export type GateControlResult = {
  status: GateControlStatus;
  state: SimulationState;
  transition: GateTransitionState | null;
};
