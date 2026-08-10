import { TRANSPARENCY_REGIME_IDS } from '../artifact/risk/regimes';
import { redemptionProbability } from '../behavior/redemption';
import type { SimulationConfig } from '../core/config';
import { parseSimulationConfig } from '../core/config';
import { runtimeFirstMoverAdvantageBps, runtimeLiquidityBufferRatioBps } from '../liquidity/buffer';
import { generateNetworkModel } from '../network/generator';
import { evaluateRiskThresholds } from '../risk/metrics';
import { createSimulationTreatment } from '../runner/treatment';
import { runSimulation } from '../runner/run';
import { semanticDigestSha256 } from '../runner/digest';
import { createValuationShockScenarios } from '../shocks/scenario';
import { createInitialSimulationState } from '../state/initialization';
import type {
  PilotCalibrationFlag,
  PilotSanityCheck,
  PilotSanityReport,
  RegimePilotDiagnostic,
} from './types';

export type PilotSanityOptions = {
  replicateId?: number;
  mechanismHorizonDays?: number;
  includeRegimeDiagnostics?: boolean;
};

function monotone(values: readonly number[], direction: 'up' | 'down'): boolean {
  return values.every((value, index) => index === 0 || (
    direction === 'up' ? value >= values[index - 1]! : value <= values[index - 1]!
  ));
}

function isolatedConfig(config: SimulationConfig): SimulationConfig {
  const value = structuredClone(config);
  value.behavior.coefficients = {
    interceptLogOdds: -20,
    perceivedRisk: 0,
    publicness: 0,
    signalSynchronicity: 0,
    expectedOthersRedeem: 0,
    firstMoverAdvantage: 0,
  };
  value.propagation.sharedAssetPassThroughBps = 0;
  value.propagation.investorOverlapTransmissionBps = 0;
  value.propagation.publicRiskTransmissionBps = 0;
  value.propagation.publicControlTransmissionBps = 0;
  value.propagation.channels = {
    sharedIlliquidAssets: false,
    investorOverlap: false,
    signalAnalogy: false,
  };
  return parseSimulationConfig(value);
}

function noShockChecks(
  config: SimulationConfig,
  replicateId: number,
  horizonDays: number,
): PilotSanityCheck[] {
  const network = generateNetworkModel(config);
  const scenario = createValuationShockScenarios(config, network, replicateId)[1]!;
  const run = runSimulation({
    treatment: createSimulationTreatment('sanity-no-shock', config, 'R1'),
    scenario,
    horizonDays,
    shockEnabled: false,
  });
  const accountingStable = run.finalState.appliedValuationShocks.length === 0
    && run.finalState.redemptionRequests.length === 0
    && run.finalState.assetSales.length === 0
    && run.finalState.funds.every((fund) => {
      const initial = network.funds.find(({ id }) => id === fund.fundId)!;
      return fund.economicAum === initial.initialAum
        && fund.reportedAum === initial.initialAum
        && fund.totalShares === initial.initialTotalShares;
    });
  const firstSnapshotByFund = new Map<
    string,
    (typeof run.finalState.oracleRiskSnapshots)[number]
  >();
  for (const snapshot of run.finalState.oracleRiskSnapshots) {
    if (!firstSnapshotByFund.has(snapshot.fundId)) firstSnapshotByFund.set(snapshot.fundId, snapshot);
  }
  const nonStaleRiskStable = run.finalState.oracleRiskSnapshots.every((snapshot) => {
    const first = firstSnapshotByFund.get(snapshot.fundId)!;
    return snapshot.metrics.valuationHaircutBps === first.metrics.valuationHaircutBps
      && snapshot.metrics.redemptionPressureBps === first.metrics.redemptionPressureBps
      && snapshot.metrics.redemptionQueueRatioBps === first.metrics.redemptionQueueRatioBps
      && snapshot.metrics.liquidityShortfallBps === first.metrics.liquidityShortfallBps
      && snapshot.metrics.investorConcentrationBps === first.metrics.investorConcentrationBps;
  });
  return [
    {
      checkId: 'no_shock_accounting_stability',
      passed: accountingStable,
      expectation: 'No shock, redemption, asset sale, AUM drift, or share-supply drift.',
      actual: {
        shockCount: run.finalState.appliedValuationShocks.length,
        requestCount: run.finalState.redemptionRequests.length,
        assetSaleCount: run.finalState.assetSales.length,
      },
    },
    {
      checkId: 'no_shock_nonstale_risk_stability',
      passed: nonStaleRiskStable,
      expectation: 'Non-stale risk inputs remain stable; only scheduled stale-pricing age may cycle.',
      actual: {
        snapshotCount: run.finalState.oracleRiskSnapshots.length,
        maximumStalePricingRiskBps: Math.max(...run.finalState.oracleRiskSnapshots.map(
          ({ metrics }) => metrics.stalePricingRiskBps,
        )),
      },
    },
  ];
}

function shockMonotonicityChecks(
  config: SimulationConfig,
  replicateId: number,
  horizonDays: number,
): PilotSanityCheck[] {
  const network = generateNetworkModel(config);
  const scenarios = createValuationShockScenarios(config, network, replicateId);
  const rows = scenarios.map((scenario) => {
    const run = runSimulation({
      treatment: createSimulationTreatment(`sanity-shock-${scenario.navDropBps}`, config, 'R1'),
      scenario,
      horizonDays,
    });
    const targetSnapshots = run.finalState.oracleRiskSnapshots.filter((snapshot) => (
      snapshot.fundId === scenario.targetFundId && snapshot.navUpdated
    ));
    if (targetSnapshots.length === 0) throw new Error('SANITY_TARGET_NAV_NEVER_UPDATED');
    return {
      navDropBps: scenario.navDropBps,
      lossAmount: run.finalState.appliedValuationShocks[0]!.lossAmount,
      maximumReportedRiskScoreBps: Math.max(...targetSnapshots.map(({ riskScoreBps }) => (
        riskScoreBps
      ))),
    };
  });
  const losses = rows.map(({ lossAmount }) => lossAmount);
  const scores = rows.map(({ maximumReportedRiskScoreBps }) => maximumReportedRiskScoreBps);
  return [
    {
      checkId: 'shock_loss_monotonicity',
      passed: monotone(losses, 'up') && new Set(losses).size === losses.length,
      expectation: 'Larger valuation shocks cause strictly larger target-fund economic losses.',
      actual: { rows },
    },
    {
      checkId: 'shock_score_monotonicity',
      passed: monotone(scores, 'up') && scores.at(-1)! > scores[0]!,
      expectation: 'Larger valuation shocks weakly increase and non-trivially change reported risk.',
      actual: { rows },
    },
  ];
}

function localFormulaChecks(config: SimulationConfig, replicateId: number): PilotSanityCheck[] {
  const network = generateNetworkModel(config);
  const scenario = createValuationShockScenarios(config, network, replicateId)[1]!;
  const state = createInitialSimulationState(network, scenario.shockAt);
  const bufferRows = network.funds.map(({ id: fundId }) => ({
    fundId,
    liquidityBufferRatioBps: runtimeLiquidityBufferRatioBps(state, network, fundId),
    firstMoverAdvantageBps: runtimeFirstMoverAdvantageBps(state, network, fundId),
  })).sort((left, right) => left.liquidityBufferRatioBps - right.liquidityBufferRatioBps);
  const privateProbability = redemptionProbability({
    perceivedRiskBps: 2_000,
    publicnessBps: 0,
    signalSynchronicityBps: 0,
    expectedOthersRedeemBps: 0,
    firstMoverAdvantageBps: 0,
  }, config.behavior.coefficients);
  const publicProbability = redemptionProbability({
    perceivedRiskBps: 2_000,
    publicnessBps: 10_000,
    signalSynchronicityBps: 0,
    expectedOthersRedeemBps: 0,
    firstMoverAdvantageBps: 0,
  }, config.behavior.coefficients);
  const tau = config.thresholds.detectionBps;
  const kappa = config.thresholds.baselineKappaBps;
  const atTau = evaluateRiskThresholds(tau, tau, kappa);
  const atKappa = evaluateRiskThresholds(kappa, tau, kappa);
  const aboveKappa = evaluateRiskThresholds(kappa + 1, tau, kappa);

  return [
    {
      checkId: 'lower_buffer_fma_monotonicity',
      passed: monotone(bufferRows.map(({ firstMoverAdvantageBps }) => (
        firstMoverAdvantageBps
      )), 'down'),
      expectation: 'First-mover advantage cannot rise as the liquidity buffer improves.',
      actual: { rows: bufferRows },
    },
    {
      checkId: 'public_signal_local_monotonicity',
      passed: publicProbability >= privateProbability
        && (config.behavior.coefficients.publicness === 0 || publicProbability > privateProbability),
      expectation: 'A non-negative publicness coefficient cannot lower local redemption probability.',
      actual: { privateProbability, publicProbability },
    },
    {
      checkId: 'threshold_boundary_operators',
      passed: atTau.detected
        && !atKappa.interventionTriggered
        && aboveKappa.interventionTriggered,
      expectation: 'Detection uses score >= tau and intervention uses score > kappa.',
      actual: { atTau, atKappa, aboveKappa },
    },
  ];
}

function phiMonotonicityCheck(config: SimulationConfig, replicateId: number): PilotSanityCheck {
  const value = structuredClone(config);
  value.thresholds.baselineKappaBps = 0;
  value.thresholds.kappaScanBps = [0];
  value.behavior.coefficients = {
    interceptLogOdds: 20,
    perceivedRisk: 0,
    publicness: 0,
    signalSynchronicity: 0,
    expectedOthersRedeem: 0,
    firstMoverAdvantage: 0,
  };
  value.liquidity.redemptionRequestFractionBps = 100;
  value.propagation.sharedAssetPassThroughBps = 0;
  value.propagation.investorOverlapTransmissionBps = 0;
  value.propagation.publicRiskTransmissionBps = 0;
  value.propagation.publicControlTransmissionBps = 0;
  value.propagation.channels = {
    sharedIlliquidAssets: false,
    investorOverlap: false,
    signalAnalogy: false,
  };
  const base = parseSimulationConfig(value);
  const network = generateNetworkModel(base);
  const scenario = createValuationShockScenarios(base, network, replicateId)[1]!;
  const initial = createInitialSimulationState(network, scenario.shockAt);
  const initialLiquidityBufferSumBps = network.funds.reduce((sum, { id }) => (
    sum + runtimeLiquidityBufferRatioBps(initial, network, id)
  ), 0);
  const rows = base.control.phiScanBps.map((phiBps) => {
    const cell = structuredClone(base);
    cell.control.baselinePhiBps = phiBps;
    const run = runSimulation({
      treatment: createSimulationTreatment(`sanity-phi-${phiBps}`, cell, 'R1'),
      scenario,
      horizonDays: 1,
    });
    const controlledFundIds = new Set(run.finalState.controlTransitions
      .filter(({ kind }) => kind === 'GateTriggered')
      .map(({ fundId }) => fundId));
    return {
      phiBps,
      controlledFundCount: controlledFundIds.size,
      settledShares: run.finalState.funds
        .filter(({ fundId }) => controlledFundIds.has(fundId))
        .reduce((sum, fund) => sum + fund.cumulativeSettledShares, 0),
      postRunLiquidityBufferSumBps: run.traces[0]!.funds
        .filter(({ fundId }) => controlledFundIds.has(fundId))
        .reduce((sum, fund) => sum + fund.liquidityBufferRatioBps, 0),
    };
  });
  const settled = rows.map(({ settledShares }) => settledShares);
  const buffers = rows.map(({ postRunLiquidityBufferSumBps }) => postRunLiquidityBufferSumBps);
  return {
    checkId: 'controlled_fund_phi_monotonicity',
    passed: rows.every(({ controlledFundCount }) => controlledFundCount > 0)
      && monotone(settled, 'down')
      && monotone(buffers, 'up'),
    expectation: 'Higher phi cannot increase controlled-fund settlement or buffer consumption.',
    actual: { initialLiquidityBufferSumBps, rows },
  };
}

function regimeDiagnostics(
  config: SimulationConfig,
  replicateId: number,
  horizonDays: number,
): RegimePilotDiagnostic[] {
  const network = generateNetworkModel(config);
  const scenario = createValuationShockScenarios(config, network, replicateId)[1]!;
  return TRANSPARENCY_REGIME_IDS.map((regimeId) => {
    const run = runSimulation({
      treatment: createSimulationTreatment(`diagnostic-${regimeId}`, config, regimeId),
      scenario,
      horizonDays,
    });
    const detectedIds = new Set(run.finalState.oracleRiskSnapshots
      .filter(({ detected }) => detected)
      .map(({ submissionId }) => submissionId));
    const firstDetection = run.regulatorRiskDisclosures
      .filter(({ sourceSubmissionId }) => detectedIds.has(sourceSubmissionId))
      .sort((left, right) => left.disclosedAt - right.disclosedAt)[0];
    return {
      regimeId,
      totalLatentRequestedShares: run.traces.flatMap(({ queues }) => queues)
        .reduce((sum, queue) => sum + queue.latentRequestedShares, 0),
      totalSettledShares: run.traces.reduce(
        (sum, trace) => sum + trace.settlement.settledShares,
        0,
      ),
      peakRequestPressureBps: Math.max(...run.traces.flatMap(({ queues }) => (
        queues.map(({ requestPressureBps }) => requestPressureBps)
      ))),
      regulatorDetectionLagSec: firstDetection
        ? firstDetection.disclosedAt - scenario.shockAt
        : null,
      regulatorDetectionCensored: firstDetection === undefined,
      publicControlDisclosureCount: run.publicControlDisclosures.length,
      runDigestSha256: run.semanticDigestSha256,
    };
  });
}

function calibrationFlags(diagnostics: readonly RegimePilotDiagnostic[]): PilotCalibrationFlag[] {
  if (diagnostics.length === 0) return [];
  const flags: PilotCalibrationFlag[] = [];
  const saturatedPressure = diagnostics
    .filter(({ peakRequestPressureBps }) => peakRequestPressureBps === 10_000)
    .map(({ regimeId }) => regimeId);
  if (saturatedPressure.length > 0) {
    flags.push({
      code: 'REDEMPTION_PRESSURE_SATURATED',
      message: 'At least one pilot regime reaches the 10000-bps request-pressure ceiling.',
      affectedRegimes: saturatedPressure,
    });
  }
  if (new Set(diagnostics.map(({ totalLatentRequestedShares }) => (
    totalLatentRequestedShares
  ))).size === 1) {
    flags.push({
      code: 'REGIME_DEMAND_SATURATED',
      message: 'All pilot regimes reach the same cumulative latent-demand ceiling.',
      affectedRegimes: diagnostics.map(({ regimeId }) => regimeId),
    });
  }
  return flags;
}

export function runPilotSanity(
  inputConfig: SimulationConfig,
  options: PilotSanityOptions = {},
): PilotSanityReport {
  const config = parseSimulationConfig(inputConfig);
  const replicateId = options.replicateId ?? 0;
  const mechanismHorizonDays = options.mechanismHorizonDays ?? 15;
  if (!Number.isSafeInteger(replicateId) || replicateId < 0) {
    throw new Error('INVALID_SANITY_REPLICATE_ID');
  }
  if (!Number.isSafeInteger(mechanismHorizonDays) || mechanismHorizonDays < 14) {
    throw new Error('SANITY_HORIZON_MUST_COVER_MAX_NAV_CADENCE');
  }
  const isolated = isolatedConfig(config);
  const checks = [
    ...noShockChecks(isolated, replicateId, mechanismHorizonDays),
    ...shockMonotonicityChecks(isolated, replicateId, mechanismHorizonDays),
    ...localFormulaChecks(config, replicateId),
    phiMonotonicityCheck(config, replicateId),
  ];
  const diagnostics = options.includeRegimeDiagnostics === false
    ? []
    : regimeDiagnostics(config, replicateId, mechanismHorizonDays);
  const flags = calibrationFlags(diagnostics);
  const reportWithoutDigest = {
    schemaVersion: 1 as const,
    replicateId,
    checks,
    overallPassed: checks.every(({ passed }) => passed),
    regimeDiagnostics: diagnostics,
    calibrationFlags: flags,
    diagnosticRankingIsPassGate: false as const,
  };
  return {
    ...reportWithoutDigest,
    semanticDigestSha256: semanticDigestSha256(reportWithoutDigest),
  };
}
