import { MAX_BPS } from '../artifact/risk/calc';
import { initializeInvestorRiskBelief } from '../behavior/beliefs';
import { TICK_SEC, TICK_STAGES, tickStartAt } from '../core/pipeline';
import { createRiskDisclosureTimelineForRegime } from '../disclosure/engine';
import type { RiskDisclosure } from '../disclosure/types';
import { liquidAssetValue, runtimeLiquidityBufferRatioBps } from '../liquidity/buffer';
import { generateNetworkModel } from '../network/generator';
import { propagateNetworkEffects } from '../network/propagation';
import type { NetworkModel, NetworkSignalSource } from '../network/types';
import {
  generateInvestorObservationSchedules,
  observeRiskDisclosures,
} from '../observation/schedule';
import { baselineOracleTreatment, submitOracleRisksForTick } from '../oracle/submission';
import { queueRedemptionRequestsForFunds, settlePendingRedemptions } from '../redemption/lifecycle';
import { applyShock } from '../shocks/apply';
import { createShockScenario, shockMagnitudeBps } from '../shocks/scenario';
import { createInitialSimulationState } from '../state/initialization';
import type { SimulationState } from '../state/types';
import { validateSimulationState } from '../state/validation';
import { applyGateControlsForSubmissions } from '../controls/lifecycle';
import { runBehaviorStep } from './behavior-step';
import {
  createControlDisclosureTimeline,
  latestDistressControlDisclosures,
} from './control-disclosure';
import { semanticDigestSha256 } from './digest';
import { mergeRiskObservations, observationsFromIndex } from './observation-state';
import { sameShockScenario, validateSimulationTreatment } from './treatment';
import type {
  ControlDisclosure,
  OracleTickTrace,
  SimulationRunInput,
  SimulationRunResult,
  TickTrace,
} from './types';

function advanceStateTime(
  state: SimulationState,
  network: NetworkModel,
  targetTime: number,
): SimulationState {
  if (!Number.isSafeInteger(targetTime) || targetTime < 0) {
    throw new Error('INVALID_RUNNER_STATE_TIME');
  }
  if (targetTime < state.nowSec) throw new Error('RUNNER_TIME_CANNOT_MOVE_BACKWARD');
  const next = { ...state, nowSec: targetTime };
  validateSimulationState(next, network);
  return next;
}

function requestedSharesInWindow(
  state: SimulationState,
  fundId: string,
  windowEndAt: number,
  windowDays: number,
): number {
  const windowStartAt = windowEndAt - windowDays * TICK_SEC;
  return state.redemptionRequests
    .filter((request) => request.fundId === fundId
      && request.requestedAt > windowStartAt
      && request.requestedAt <= windowEndAt)
    .reduce((sum, request) => sum + request.requestedShares, 0);
}

function newlyAvailableRiskDisclosures(
  timeline: readonly RiskDisclosure[],
  materializedIds: Set<string>,
  decisionAt: number,
): RiskDisclosure[] {
  const available = timeline.filter((disclosure) => (
    disclosure.disclosedAt <= decisionAt
    && !materializedIds.has(disclosure.sourceSubmissionId)
  ));
  available.forEach(({ sourceSubmissionId }) => materializedIds.add(sourceSubmissionId));
  return available;
}

function newlyAvailableControlDisclosures(
  timeline: readonly ControlDisclosure[],
  materializedIds: Set<string>,
  decisionAt: number,
): ControlDisclosure[] {
  const available = timeline.filter((disclosure) => (
    disclosure.disclosedAt <= decisionAt
    && !materializedIds.has(disclosure.transitionId)
  ));
  available.forEach(({ transitionId }) => materializedIds.add(transitionId));
  return available;
}

function latestByFund<T extends { fundId: string }>(values: readonly T[]): T[] {
  const latest = new Map<string, T>();
  for (const value of values) latest.set(value.fundId, value);
  return [...latest.values()].sort((left, right) => left.fundId.localeCompare(right.fundId));
}

function scenarioMatchesConfig(input: SimulationRunInput, network: NetworkModel): boolean {
  return sameShockScenario(createShockScenario(
    input.treatment.config,
    network,
    input.scenario.replicateId,
    input.scenario.shockType,
    shockMagnitudeBps(input.scenario),
    input.scenario.targetSelectionFundCount ?? network.funds.length,
  ), input.scenario);
}

function validateRunInput(input: SimulationRunInput, network: NetworkModel): number {
  validateSimulationTreatment(input.treatment);
  if (!scenarioMatchesConfig(input, network)) throw new Error('SCENARIO_CONFIG_MISMATCH');
  const horizonDays = input.horizonDays ?? input.treatment.config.time.horizonDays;
  if (
    !Number.isSafeInteger(horizonDays)
    || horizonDays <= 0
    || horizonDays > input.treatment.config.time.horizonDays
  ) throw new Error('INVALID_RUN_HORIZON_DAYS');
  const oracle = baselineOracleTreatment(input.treatment.config);
  const latestAttemptOffset = oracle.latencySec + (oracle.maxAttempts - 1) * oracle.retryDelaySec;
  if (latestAttemptOffset >= TICK_SEC) throw new Error('ORACLE_ATTEMPTS_CROSS_TICK_BOUNDARY');
  return horizonDays;
}

function initialBeliefs(state: SimulationState, priorBps: number) {
  return state.holderBalances.map(({ investorId, fundId }) => (
    initializeInvestorRiskBelief(investorId, fundId, priorBps)
  )).sort((left, right) => (
    left.fundId.localeCompare(right.fundId)
    || left.investorId.localeCompare(right.investorId)
  ));
}

function riskSignals(disclosures: readonly RiskDisclosure[], tick: number): NetworkSignalSource[] {
  return latestByFund(disclosures).map((disclosure) => ({
    sourceId: disclosure.sourceSubmissionId,
    kind: 'public_risk',
    sourceFundId: disclosure.fundId,
    tick,
    availableAt: disclosure.disclosedAt,
    magnitudeBps: disclosure.signal.valueBps,
  }));
}

function controlSignals(
  disclosures: readonly ControlDisclosure[],
  tick: number,
): NetworkSignalSource[] {
  return latestDistressControlDisclosures(disclosures).map((disclosure) => ({
    sourceId: disclosure.transitionId,
    kind: 'public_control',
    sourceFundId: disclosure.fundId,
    tick,
    availableAt: disclosure.disclosedAt,
    magnitudeBps: MAX_BPS,
  }));
}

function reservePropagationSources(
  processed: Set<string>,
  assetSaleIds: readonly string[],
  signals: readonly NetworkSignalSource[],
): void {
  const keys = [
    ...assetSaleIds.map((saleId) => `asset_sale\u0000${saleId}`),
    ...signals.map(({ kind, sourceId }) => `${kind}\u0000${sourceId}`),
  ];
  for (const key of keys) {
    if (processed.has(key)) throw new Error('RUNNER_PROPAGATION_SOURCE_ALREADY_PROCESSED');
  }
  keys.forEach((key) => processed.add(key));
}

export function runSimulation(input: SimulationRunInput): SimulationRunResult {
  const { treatment, scenario } = input;
  const { config, regime } = treatment;
  const shockEnabled = input.shockEnabled ?? true;
  const network = generateNetworkModel(config);
  const horizonDays = validateRunInput(input, network);
  let state = createInitialSimulationState(network, scenario.shockAt);
  let beliefs = initialBeliefs(state, config.behavior.initialRiskPriorBps);
  const activeInvestorIds = new Set(state.holderBalances.map(({ investorId }) => investorId));
  const schedules = generateInvestorObservationSchedules(
    config,
    network,
    scenario.replicateId,
    scenario.shockAt,
  ).filter(({ investorId }) => activeInvestorIds.has(investorId));

  const publicRiskDisclosures: RiskDisclosure[] = [];
  const regulatorRiskDisclosures: RiskDisclosure[] = [];
  const publicControlDisclosures: ControlDisclosure[] = [];
  const regulatorControlDisclosures: ControlDisclosure[] = [];
  const riskObservationIndex = new Map<
    string,
    ReturnType<typeof observeRiskDisclosures>[number]
  >();
  const publicRiskIds = new Set<string>();
  const regulatorRiskIds = new Set<string>();
  const publicControlIds = new Set<string>();
  const regulatorControlIds = new Set<string>();
  const processedPropagationSources = new Set<string>();
  const archivedNetworkPropagations: SimulationState['networkPropagations'] = [];
  let laggedRequestPressureByFund = new Map<string, number>();
  let incomingSpilloverByFund = new Map<string, number>();
  const traces: TickTrace[] = [];

  for (let tick = 0; tick < horizonDays; tick += 1) {
    const tickStartedAt = tickStartAt(scenario.shockAt, tick);
    const decisionAt = tickStartedAt + TICK_SEC - 1;
    state = advanceStateTime(state, network, tickStartedAt);
    const shockApplied = shockEnabled && tick === 0;
    if (shockApplied) state = applyShock(state, network, scenario);

    const oracleRequests = [...network.funds]
      .sort((left, right) => left.id.localeCompare(right.id))
      .map((fund) => ({
        replicateId: scenario.replicateId,
        tick,
        fundId: fund.id,
        occurredAt: tickStartedAt,
        requestedSharesInWindow: requestedSharesInWindow(
          state,
          fund.id,
          tickStartedAt,
          config.time.primaryWindowDays,
        ),
      }));
    const oracleBatch = submitOracleRisksForTick(state, network, config, oracleRequests);
    state = oracleBatch.state;
    const oracleTraces: OracleTickTrace[] = [];
    const newSubmissionIds: string[] = [];
    for (let index = 0; index < oracleBatch.results.length; index += 1) {
      const result = oracleBatch.results[index]!;
      const snapshot = result.status === 'submitted'
        ? result.state.oracleRiskSnapshots.at(-1)!
        : null;
      if (snapshot) newSubmissionIds.push(snapshot.submissionId);
      oracleTraces.push({
        fundId: oracleRequests[index]!.fundId,
        status: result.status,
        attemptCount: result.attempts.length,
        failedAttemptCount: result.attempts.filter(({ failed }) => failed).length,
        submissionId: snapshot?.submissionId ?? null,
        riskScoreBps: result.candidate.riskScoreBps,
        detected: snapshot?.detected ?? false,
        interventionTriggered: snapshot?.interventionTriggered ?? false,
        controlTransition: null,
      });
    }

    const controlBatch = applyGateControlsForSubmissions(
      state,
      network,
      config,
      newSubmissionIds,
    );
    state = controlBatch.state;
    for (let index = 0; index < controlBatch.results.length; index += 1) {
      const controlled = controlBatch.results[index]!;
      const submissionId = newSubmissionIds[index]!;
      const trace = oracleTraces.find((candidate) => candidate.submissionId === submissionId)!;
      trace.controlTransition = controlled.transition?.kind ?? null;
    }

    const publicRiskTimeline = treatment.mechanisms.publicRiskDisclosureEnabled
      ? createRiskDisclosureTimelineForRegime(
          state.oracleRiskSnapshots,
          regime,
          'public',
          config.thresholds.detectionBps,
        )
      : [];
    const regulatorRiskTimeline = createRiskDisclosureTimelineForRegime(
      state.oracleRiskSnapshots,
      regime,
      'regulator',
      config.thresholds.detectionBps,
    );
    const newPublicRisk = newlyAvailableRiskDisclosures(
      publicRiskTimeline,
      publicRiskIds,
      decisionAt,
    );
    const newRegulatorRisk = newlyAvailableRiskDisclosures(
      regulatorRiskTimeline,
      regulatorRiskIds,
      decisionAt,
    );
    publicRiskDisclosures.push(...newPublicRisk);
    regulatorRiskDisclosures.push(...newRegulatorRisk);

    const publicControlTimeline = createControlDisclosureTimeline(
      state.controlTransitions,
      regime,
      'public',
    );
    const regulatorControlTimeline = createControlDisclosureTimeline(
      state.controlTransitions,
      regime,
      'regulator',
    );
    const newPublicControl = newlyAvailableControlDisclosures(
      publicControlTimeline,
      publicControlIds,
      decisionAt,
    );
    const newRegulatorControl = newlyAvailableControlDisclosures(
      regulatorControlTimeline,
      regulatorControlIds,
      decisionAt,
    );
    publicControlDisclosures.push(...newPublicControl);
    regulatorControlDisclosures.push(...newRegulatorControl);

    mergeRiskObservations(
      riskObservationIndex,
      observeRiskDisclosures(newPublicRisk, schedules),
      publicRiskDisclosures,
    );
    const riskObservations = observationsFromIndex(riskObservationIndex);
    state = advanceStateTime(state, network, decisionAt);
    const behavior = runBehaviorStep({
      state,
      network,
      config,
      replicateId: scenario.replicateId,
      tick,
      decisionAt,
      scheduleAnchorAt: scenario.shockAt,
      beliefs,
      observations: riskObservations,
      publicRiskDisclosures,
      laggedRequestPressureByFund,
      incomingSpilloverByFund,
    });
    beliefs = behavior.beliefs;

    const queued = queueRedemptionRequestsForFunds(
      state,
      network,
      [...network.funds]
        .sort((left, right) => left.id.localeCompare(right.id))
        .map((fund) => ({
          fundId: fund.id,
          intents: behavior.intentsByFund.get(fund.id) ?? [],
        })),
      config.liquidity.redemptionRequestFractionBps,
      config.control.seed,
    );
    state = queued.state;
    const queues: TickTrace['queues'] = queued.summaries;
    laggedRequestPressureByFund = new Map(
      queues.map(({ fundId, requestPressureBps }) => [fundId, requestPressureBps]),
    );

    const assetSaleCountBefore = state.assetSales.length;
    const settled = settlePendingRedemptions(state, network, config);
    state = settled.state;
    const newAssetSaleIds = state.assetSales
      .slice(assetSaleCountBefore)
      .map(({ saleId }) => saleId);
    const signals: NetworkSignalSource[] = [
      ...queues.filter(({ requestPressureBps }) => requestPressureBps > 0).map((queue) => ({
        sourceId: `redemption-pressure:r${scenario.replicateId}:t${tick}:${queue.fundId}`,
        kind: 'redemption_pressure' as const,
        sourceFundId: queue.fundId,
        tick,
        availableAt: decisionAt,
        magnitudeBps: queue.requestPressureBps,
      })),
      ...riskSignals(newPublicRisk, tick),
      ...controlSignals(newPublicControl, tick),
    ];
    reservePropagationSources(processedPropagationSources, newAssetSaleIds, signals);
    const propagated = propagateNetworkEffects(state, network, config, {
      replicateId: scenario.replicateId,
      tick,
      propagatedAt: decisionAt,
      assetSaleIds: newAssetSaleIds,
      signals,
    });
    archivedNetworkPropagations.push(...propagated.records);
    state = { ...propagated.state, networkPropagations: [] };
    validateSimulationState(state, network);
    incomingSpilloverByFund = new Map(propagated.targetSummaries.map((summary) => [
      summary.targetFundId,
      summary.incomingSpilloverRedemptionBps,
    ]));

    traces.push({
      tick,
      tickStartedAt,
      decisionAt,
      stageOrder: TICK_STAGES,
      shockApplied,
      oracle: oracleTraces,
      newPublicRiskDisclosureIds: newPublicRisk.map(({ sourceSubmissionId }) => sourceSubmissionId),
      newRegulatorRiskDisclosureIds: newRegulatorRisk.map(({ sourceSubmissionId }) => sourceSubmissionId),
      newPublicControlTransitionIds: newPublicControl.map(({ transitionId }) => transitionId),
      newRegulatorControlTransitionIds: newRegulatorControl.map(({ transitionId }) => transitionId),
      newlyObservableRiskObservationCount: riskObservations.filter(({ observedAt }) => (
        observedAt >= tickStartedAt && observedAt <= decisionAt
      )).length,
      behavior: behavior.traces,
      queues,
      settlement: settled.summary,
      newAssetSaleIds,
      propagationRecordCount: propagated.records.length,
      propagationTargets: propagated.targetSummaries,
      funds: state.funds.map((fund) => ({
        fundId: fund.fundId,
        economicAum: fund.economicAum,
        reportedAum: fund.reportedAum,
        totalShares: fund.totalShares,
        queuedRedemptionShares: fund.queuedRedemptionShares,
        liquidAssetValue: liquidAssetValue(state, network, fund.fundId),
        liquidityBufferRatioBps: runtimeLiquidityBufferRatioBps(state, network, fund.fundId),
        gated: fund.gated,
      })),
    });
  }

  state = { ...state, networkPropagations: archivedNetworkPropagations };
  validateSimulationState(state, network);

  const resultWithoutDigest = {
    schemaVersion: 1 as const,
    treatmentId: treatment.treatmentId,
    configDigestSha256: semanticDigestSha256(config),
    treatmentDigestSha256: semanticDigestSha256({
      config,
      regime,
      mechanisms: treatment.mechanisms,
    }),
    regime,
    mechanisms: treatment.mechanisms,
    scenario,
    horizonDays,
    shockEnabled,
    traces,
    publicRiskDisclosures,
    regulatorRiskDisclosures,
    publicControlDisclosures,
    regulatorControlDisclosures,
    riskObservations: observationsFromIndex(riskObservationIndex)
      .filter(({ observedAt }) => observedAt <= state.nowSec),
    finalBeliefs: beliefs,
    finalState: state,
  };
  return {
    ...resultWithoutDigest,
    semanticDigestSha256: semanticDigestSha256(resultWithoutDigest),
  };
}
