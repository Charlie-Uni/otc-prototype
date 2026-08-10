import type { TransparencyRegimeId } from '../artifact/risk/regimes';

export type PilotSanityCheckId =
  | 'no_shock_accounting_stability'
  | 'no_shock_nonstale_risk_stability'
  | 'shock_loss_monotonicity'
  | 'shock_score_monotonicity'
  | 'lower_buffer_fma_monotonicity'
  | 'public_signal_local_monotonicity'
  | 'threshold_boundary_operators'
  | 'controlled_fund_phi_monotonicity';

export type PilotSanityCheck = {
  checkId: PilotSanityCheckId;
  passed: boolean;
  expectation: string;
  actual: Record<string, unknown>;
};

export type RegimePilotDiagnostic = {
  regimeId: TransparencyRegimeId;
  totalLatentRequestedShares: number;
  totalSettledShares: number;
  peakRequestPressureBps: number;
  regulatorDetectionLagSec: number | null;
  regulatorDetectionCensored: boolean;
  publicControlDisclosureCount: number;
  runDigestSha256: string;
};

export type PilotCalibrationFlag = {
  code: 'REDEMPTION_PRESSURE_SATURATED' | 'REGIME_DEMAND_SATURATED';
  message: string;
  affectedRegimes: TransparencyRegimeId[];
};

export type PilotSanityReport = {
  schemaVersion: 1;
  replicateId: number;
  checks: PilotSanityCheck[];
  overallPassed: boolean;
  regimeDiagnostics: RegimePilotDiagnostic[];
  calibrationFlags: PilotCalibrationFlag[];
  diagnosticRankingIsPassGate: false;
  semanticDigestSha256: string;
};
