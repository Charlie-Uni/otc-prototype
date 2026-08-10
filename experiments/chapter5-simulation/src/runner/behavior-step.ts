import { MAX_BPS } from '../artifact/risk/calc';
import {
  initializeInvestorRiskBelief,
  updateInvestorRiskBelief,
} from '../behavior/beliefs';
import { evaluateInvestorRedemption } from '../behavior/redemption';
import type { InvestorRiskBelief } from '../behavior/types';
import type { SimulationConfig } from '../core/config';
import type { RiskDisclosure } from '../disclosure/types';
import { runtimeFirstMoverAdvantageBps } from '../liquidity/buffer';
import type { NetworkModel } from '../network/types';
import { computeSignalSynchronicityBps } from '../observation/schedule';
import type { InvestorRiskObservation } from '../observation/types';
import type { InvestorRedemptionIntent } from '../redemption/types';
import type { SimulationState } from '../state/types';
import { applyIncomingSpilloverToDecision } from './network-demand';
import type { FundBehaviorTrace } from './types';

type BehaviorStepInput = {
  state: SimulationState;
  network: NetworkModel;
  config: SimulationConfig;
  replicateId: number;
  tick: number;
  decisionAt: number;
  scheduleAnchorAt: number;
  beliefs: readonly InvestorRiskBelief[];
  observations: readonly InvestorRiskObservation[];
  publicRiskDisclosures: readonly RiskDisclosure[];
  laggedRequestPressureByFund: ReadonlyMap<string, number>;
  incomingSpilloverByFund: ReadonlyMap<string, number>;
};

export type BehaviorStepResult = {
  beliefs: InvestorRiskBelief[];
  intentsByFund: Map<string, InvestorRedemptionIntent[]>;
  traces: FundBehaviorTrace[];
};

function beliefKey(investorId: string, fundId: string): string {
  return `${investorId}\u0000${fundId}`;
}

function meanProbabilityBps(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return Math.round(
    values.reduce((sum, value) => sum + value, 0) * MAX_BPS / values.length,
  );
}

function latestDisclosureByFund(
  disclosures: readonly RiskDisclosure[],
  decisionAt: number,
): Map<string, RiskDisclosure> {
  const latest = new Map<string, RiskDisclosure>();
  for (const disclosure of disclosures) {
    if (disclosure.audience !== 'public' || disclosure.disclosedAt > decisionAt) continue;
    const current = latest.get(disclosure.fundId);
    if (
      !current
      || disclosure.disclosedAt > current.disclosedAt
      || (
        disclosure.disclosedAt === current.disclosedAt
        && disclosure.sourceSubmittedAt > current.sourceSubmittedAt
      )
    ) latest.set(disclosure.fundId, disclosure);
  }
  return latest;
}

export function runBehaviorStep(input: BehaviorStepInput): BehaviorStepResult {
  const observationsByBelief = new Map<string, InvestorRiskObservation[]>();
  const observationsBySubmission = new Map<string, InvestorRiskObservation[]>();
  for (const observation of input.observations) {
    const key = beliefKey(observation.investorId, observation.fundId);
    const values = observationsByBelief.get(key) ?? [];
    values.push(observation);
    observationsByBelief.set(key, values);
    if (observation.observedAt <= input.decisionAt) {
      const submissionObservations = observationsBySubmission.get(observation.sourceSubmissionId)
        ?? [];
      submissionObservations.push(observation);
      observationsBySubmission.set(observation.sourceSubmissionId, submissionObservations);
    }
  }

  const beliefByKey = new Map(input.beliefs.map((belief) => [
    beliefKey(belief.investorId, belief.fundId),
    belief,
  ]));
  const latestByFund = latestDisclosureByFund(input.publicRiskDisclosures, input.decisionAt);
  const intentsByFund = new Map<string, InvestorRedemptionIntent[]>();
  const traces: FundBehaviorTrace[] = [];

  for (const fundNode of [...input.network.funds].sort((left, right) => left.id.localeCompare(right.id))) {
    const activeHoldings = input.state.holderBalances
      .filter(({ fundId, shares }) => fundId === fundNode.id && shares > 0)
      .sort((left, right) => left.investorId.localeCompare(right.investorId));
    const activeInvestorIds = new Set(activeHoldings.map(({ investorId }) => investorId));
    const latestDisclosure = latestByFund.get(fundNode.id) ?? null;
    const synchronicityBps = latestDisclosure
      ? computeSignalSynchronicityBps(
        (observationsBySubmission.get(latestDisclosure.sourceSubmissionId) ?? [])
          .filter(({ investorId }) => activeInvestorIds.has(investorId))
          .map(({ observedAt }) => observedAt),
        input.scheduleAnchorAt,
        input.config.observation.synchronicityBucketSec,
      )
      : 0;
    const laggedRequestPressureBps = input.laggedRequestPressureByFund.get(fundNode.id) ?? 0;
    const incomingSpilloverRedemptionBps = input.incomingSpilloverByFund.get(fundNode.id) ?? 0;
    const firstMoverAdvantageBps = runtimeFirstMoverAdvantageBps(
      input.state,
      input.network,
      fundNode.id,
    );
    const intents: InvestorRedemptionIntent[] = [];
    const baseProbabilities: number[] = [];
    const finalProbabilities: number[] = [];

    for (const holding of activeHoldings) {
      const key = beliefKey(holding.investorId, holding.fundId);
      const previous = beliefByKey.get(key) ?? initializeInvestorRiskBelief(
        holding.investorId,
        holding.fundId,
        input.config.behavior.initialRiskPriorBps,
      );
      const belief = updateInvestorRiskBelief(
        previous,
        observationsByBelief.get(key) ?? [],
        input.decisionAt,
      );
      beliefByKey.set(key, belief);
      const base = evaluateInvestorRedemption(
        belief,
        synchronicityBps,
        laggedRequestPressureBps,
        firstMoverAdvantageBps,
        input.config.behavior.expectedOthersWeightsBps,
        input.config.behavior.coefficients,
        {
          masterSeed: BigInt(input.config.behavior.seed),
          replicateId: input.replicateId,
          investorId: holding.investorId,
          fundId: holding.fundId,
          tick: input.tick,
        },
      );
      const adjusted = applyIncomingSpilloverToDecision(
        base,
        incomingSpilloverRedemptionBps,
      );
      baseProbabilities.push(adjusted.baseProbability);
      finalProbabilities.push(adjusted.decision.probability);
      intents.push({
        replicateId: input.replicateId,
        investorId: holding.investorId,
        fundId: holding.fundId,
        tick: input.tick,
        redeem: adjusted.decision.redeem,
      });
    }

    intentsByFund.set(fundNode.id, intents);
    traces.push({
      fundId: fundNode.id,
      latestPublicSubmissionId: latestDisclosure?.sourceSubmissionId ?? null,
      signalSynchronicityBps: synchronicityBps,
      laggedRequestPressureBps,
      incomingSpilloverRedemptionBps,
      eligibleInvestorCount: activeHoldings.length,
      redeemingInvestorCount: intents.filter(({ redeem }) => redeem).length,
      meanBaseProbabilityBps: meanProbabilityBps(baseProbabilities),
      meanFinalProbabilityBps: meanProbabilityBps(finalProbabilities),
    });
  }

  return {
    beliefs: [...beliefByKey.values()].sort((left, right) => (
      left.fundId.localeCompare(right.fundId)
      || left.investorId.localeCompare(right.investorId)
    )),
    intentsByFund,
    traces,
  };
}
