import type { RiskDisclosure, VisibleRiskSignal } from '../disclosure/types';

export type InvestorObservationSchedule = {
  investorId: string;
  observationStartAt: number;
  pollingIntervalSec: number;
};

export type InvestorRiskObservation = {
  investorId: string;
  fundId: string;
  regimeId: RiskDisclosure['regimeId'];
  sourceSubmissionId: string;
  disclosedAt: number;
  observedAt: number;
  thresholdBps: number;
  thresholdIdentifiable: boolean;
  signal: VisibleRiskSignal;
};
