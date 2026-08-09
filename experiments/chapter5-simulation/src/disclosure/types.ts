import type { TransparencyRegimeId } from '../artifact/risk/regimes';

export type RiskSignalBand = 'green' | 'yellow' | 'red';

export type VisibleRiskSignal =
  | {
      kind: 'exact';
      valueBps: number;
      band: RiskSignalBand;
    }
  | {
      kind: 'band';
      valueBps: number;
      band: RiskSignalBand;
    };

export type RiskDisclosure = {
  sourceSubmissionId: string;
  fundId: string;
  regimeId: TransparencyRegimeId;
  audience: 'public' | 'regulator';
  sourceOccurredAt: number;
  sourceSubmittedAt: number;
  disclosedAt: number;
  thresholdBps: number;
  thresholdIdentifiable: boolean;
  signal: VisibleRiskSignal;
};
