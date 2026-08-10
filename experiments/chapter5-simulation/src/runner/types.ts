import type { TransparencyRegime } from '../artifact/risk/regimes';
import type { InvestorRiskBelief } from '../behavior/types';
import type { SimulationConfig } from '../core/config';
import type { TickStage } from '../core/pipeline';
import type { RiskDisclosure } from '../disclosure/types';
import type { NetworkPropagationTargetSummary } from '../network/propagation';
import type { InvestorRiskObservation } from '../observation/types';
import type { QueueRedemptionSummary, SettlementBatchSummary } from '../redemption/types';
import type { ShockScenario } from '../shocks/scenario';
import type {
  GateTransitionKind,
  SimulationState,
} from '../state/types';

export type SimulationMechanisms = {
  publicRiskDisclosureEnabled: boolean;
};

export type SimulationTreatment = {
  treatmentId: string;
  config: SimulationConfig;
  regime: TransparencyRegime;
  mechanisms: SimulationMechanisms;
};

export type ControlDisclosure = {
  transitionId: string;
  fundId: string;
  regimeId: TransparencyRegime['id'];
  audience: 'public' | 'regulator';
  kind: GateTransitionKind;
  sourceSubmissionId: string;
  sourceTransitionedAt: number;
  disclosedAt: number;
  riskScoreBps: number;
};

export type OracleTickTrace = {
  fundId: string;
  status: 'submitted' | 'failed';
  attemptCount: number;
  failedAttemptCount: number;
  submissionId: string | null;
  riskScoreBps: number;
  detected: boolean;
  interventionTriggered: boolean;
  controlTransition: GateTransitionKind | null;
};

export type FundBehaviorTrace = {
  fundId: string;
  latestPublicSubmissionId: string | null;
  signalSynchronicityBps: number;
  laggedRequestPressureBps: number;
  incomingSpilloverRedemptionBps: number;
  eligibleInvestorCount: number;
  redeemingInvestorCount: number;
  meanBaseProbabilityBps: number;
  meanFinalProbabilityBps: number;
};

export type FundStateTrace = {
  fundId: string;
  economicAum: number;
  reportedAum: number;
  totalShares: number;
  queuedRedemptionShares: number;
  liquidAssetValue: number;
  liquidityBufferRatioBps: number;
  gated: boolean;
};

export type TickTrace = {
  tick: number;
  tickStartedAt: number;
  decisionAt: number;
  stageOrder: readonly TickStage[];
  shockApplied: boolean;
  oracle: OracleTickTrace[];
  newPublicRiskDisclosureIds: string[];
  newRegulatorRiskDisclosureIds: string[];
  newPublicControlTransitionIds: string[];
  newRegulatorControlTransitionIds: string[];
  newlyObservableRiskObservationCount: number;
  behavior: FundBehaviorTrace[];
  queues: QueueRedemptionSummary[];
  settlement: SettlementBatchSummary;
  newAssetSaleIds: string[];
  propagationRecordCount: number;
  propagationTargets: NetworkPropagationTargetSummary[];
  funds: FundStateTrace[];
};

export type SimulationRunInput = {
  treatment: SimulationTreatment;
  scenario: ShockScenario;
  horizonDays?: number;
  shockEnabled?: boolean;
};

export type SimulationRunResult = {
  schemaVersion: 1;
  treatmentId: string;
  configDigestSha256: string;
  treatmentDigestSha256: string;
  regime: TransparencyRegime;
  mechanisms: SimulationMechanisms;
  scenario: ShockScenario;
  horizonDays: number;
  shockEnabled: boolean;
  traces: TickTrace[];
  publicRiskDisclosures: RiskDisclosure[];
  regulatorRiskDisclosures: RiskDisclosure[];
  publicControlDisclosures: ControlDisclosure[];
  regulatorControlDisclosures: ControlDisclosure[];
  riskObservations: InvestorRiskObservation[];
  finalBeliefs: InvestorRiskBelief[];
  finalState: SimulationState;
  semanticDigestSha256: string;
};
