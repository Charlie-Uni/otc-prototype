import { TRANSPARENCY_REGIME_IDS } from '../artifact/risk/regimes';
import type { SimulationConfig } from '../core/config';
import { generateNetworkModel } from '../network/generator';
import { ratioBps } from '../metrics/math';
import { regulatorDetectionLagForThreshold } from '../metrics/detection';
import { extractRunOutcomeMetrics } from '../metrics/outcomes';
import type { RunOutcomeMetrics } from '../metrics/outcome-types';
import { runSimulation } from '../runner/run';
import type { SimulationRunResult } from '../runner/types';
import { createSimulationTreatment } from '../runner/treatment';
import { createValuationShockScenarios } from '../shocks/scenario';
import { configForCalibrationCandidate } from './grid';
import { thresholdKey } from './detection-threshold';
import type {
  CalibrationCandidate,
  CalibrationObservation,
  PilotCalibrationConfig,
} from './types';

function aggregateOutcome(
  outcome: RunOutcomeMetrics,
  candidateId: string,
  regimeId: CalibrationObservation['regimeId'],
  runDigestSha256: string,
  regulatorDetectionLagSecByThresholdBps: Record<string, number | null>,
): CalibrationObservation {
  const initialShares = outcome.funds.reduce((sum, fund) => sum + fund.initialTotalShares, 0);
  const initialAum = outcome.funds.reduce((sum, fund) => sum + fund.initialAum, 0);
  const detection = outcome.detection.regulatorDisclosure;
  return {
    candidateId,
    replicateId: outcome.replicateId,
    regimeId,
    acceptedRequestRateBps: ratioBps(
      outcome.funds.reduce((sum, fund) => sum + fund.cumulativeRequestedShares, 0),
      initialShares,
      'CALIBRATION_ACCEPTED_REQUEST_RATE',
    ),
    latentRequestRateBps: ratioBps(
      outcome.funds.reduce((sum, fund) => sum + fund.cumulativeLatentRequestedShares, 0),
      initialShares,
      'CALIBRATION_LATENT_REQUEST_RATE',
    ),
    peakRequestPressureBps: Math.max(...outcome.funds.map(({ peakRedemptionBps }) => (
      peakRedemptionBps
    ))),
    lossMagnitudeBps: ratioBps(
      outcome.funds.reduce((sum, fund) => sum + fund.lossAmount, 0),
      initialAum,
      'CALIBRATION_LOSS_MAGNITUDE',
    ),
    regulatorDetectionLagSec: detection.status === 'detected' ? detection.lagSec : null,
    regulatorDetectionCensored: detection.status === 'censored',
    regulatorDetectionLagSecByThresholdBps,
    runDigestSha256,
  };
}

function detectionLagsByThreshold(
  result: SimulationRunResult,
  candidatesBps: readonly number[],
): Record<string, number | null> {
  return Object.fromEntries(candidatesBps.map((thresholdBps) => {
    const outcome = regulatorDetectionLagForThreshold(result, thresholdBps);
    return [thresholdKey(thresholdBps), outcome.status === 'detected' ? outcome.lagSec : null];
  }));
}

export function observationsForCandidate(
  baseline: SimulationConfig,
  candidate: CalibrationCandidate,
  replicateCount: number,
  calibration: PilotCalibrationConfig,
  replicateStart = 0,
): CalibrationObservation[] {
  if (!Number.isSafeInteger(replicateStart) || replicateStart < 0) {
    throw new Error('INVALID_CALIBRATION_REPLICATE_START');
  }
  const config = configForCalibrationCandidate(baseline, candidate);
  const network = generateNetworkModel(config);
  const observations: CalibrationObservation[] = [];
  const replicateEnd = replicateStart + replicateCount;
  for (let replicateId = replicateStart; replicateId < replicateEnd; replicateId += 1) {
    const scenario = createValuationShockScenarios(config, network, replicateId).find(
      ({ navDropBps }) => navDropBps === calibration.baselineValuationShockBps,
    );
    if (!scenario) throw new Error('BASELINE_CALIBRATION_SHOCK_NOT_CONFIGURED');
    const noShock = runSimulation({
      treatment: createSimulationTreatment(
        `${candidate.candidateId}:r${replicateId}:no-shock`,
        config,
        'R1',
      ),
      scenario,
      horizonDays: calibration.windowDays,
      shockEnabled: false,
    });
    observations.push(aggregateOutcome(
      extractRunOutcomeMetrics(noShock, config, calibration.windowDays),
      candidate.candidateId,
      'NO_SHOCK',
      noShock.semanticDigestSha256,
      detectionLagsByThreshold(
        noShock,
        calibration.detectionThresholdCalibration.candidatesBps,
      ),
    ));
    for (const regimeId of TRANSPARENCY_REGIME_IDS) {
      const result = runSimulation({
        treatment: createSimulationTreatment(
          `${candidate.candidateId}:r${replicateId}:${regimeId}`,
          config,
          regimeId,
        ),
        scenario,
        horizonDays: calibration.windowDays,
      });
      observations.push(aggregateOutcome(
        extractRunOutcomeMetrics(result, config, calibration.windowDays),
        candidate.candidateId,
        regimeId,
        result.semanticDigestSha256,
        detectionLagsByThreshold(
          result,
          calibration.detectionThresholdCalibration.candidatesBps,
        ),
      ));
    }
  }
  return observations;
}
