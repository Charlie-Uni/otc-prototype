export const TICK_SEC = 86_400;

export const TICK_STAGES = [
  'apply_shock',
  'submit_oracle_state',
  'apply_disclosure_policy',
  'observe_disclosures',
  'update_beliefs',
  'decide_redemptions',
  'queue_and_settle',
  'update_nav',
  'propagate_network_effects',
] as const;

export type TickStage = typeof TICK_STAGES[number];

export type EventWindow = {
  startSec: number;
  endExclusiveSec: number;
};

export function tickStartAt(genesisAt: number, tick: number): number {
  if (!Number.isSafeInteger(genesisAt) || genesisAt < 0) throw new Error('INVALID_GENESIS_AT');
  if (!Number.isSafeInteger(tick) || tick < 0) throw new Error('INVALID_TICK');
  return genesisAt + tick * TICK_SEC;
}

export function eventWindowFromShock(shockAt: number, days: number): EventWindow {
  if (!Number.isSafeInteger(shockAt) || shockAt < 0) throw new Error('INVALID_SHOCK_AT');
  if (!Number.isSafeInteger(days) || days <= 0) throw new Error('INVALID_WINDOW_DAYS');
  return { startSec: shockAt, endExclusiveSec: shockAt + days * TICK_SEC };
}

export function runTickStages(runStage: (stage: TickStage) => void): void {
  TICK_STAGES.forEach(runStage);
}
