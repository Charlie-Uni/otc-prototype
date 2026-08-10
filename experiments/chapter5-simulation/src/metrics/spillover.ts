import { MAX_BPS } from '../artifact/risk/calc';

function requireBps(value: number, field: string): void {
  if (!Number.isInteger(value) || value < 0 || value > MAX_BPS) {
    throw new Error(`INVALID_${field}`);
  }
}

export function spilloverRedemptionBps(
  sourceSignalBps: number,
  networkProximityBps: number,
  transmissionBps: number,
): number {
  requireBps(sourceSignalBps, 'SPILLOVER_SOURCE_SIGNAL_BPS');
  requireBps(networkProximityBps, 'SPILLOVER_PROXIMITY_BPS');
  requireBps(transmissionBps, 'SPILLOVER_TRANSMISSION_BPS');
  return Number(
    BigInt(sourceSignalBps)
      * BigInt(networkProximityBps)
      * BigInt(transmissionBps)
      / BigInt(MAX_BPS)
      / BigInt(MAX_BPS),
  );
}

export function aggregateSpilloverRedemptionBps(values: readonly number[]): number {
  let total = 0;
  for (const value of values) {
    requireBps(value, 'SPILLOVER_COMPONENT_BPS');
    total = Math.min(MAX_BPS, total + value);
  }
  return total;
}

export function pairedSpilloverRedemptionBps(
  networkScenarioRedemptionBps: number,
  disabledChannelRedemptionBps: number,
): number {
  requireBps(networkScenarioRedemptionBps, 'NETWORK_SCENARIO_REDEMPTION_BPS');
  requireBps(disabledChannelRedemptionBps, 'DISABLED_CHANNEL_REDEMPTION_BPS');
  return networkScenarioRedemptionBps - disabledChannelRedemptionBps;
}
