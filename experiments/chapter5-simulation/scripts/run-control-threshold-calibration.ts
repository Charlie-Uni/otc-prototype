import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { semanticDigestSha256 } from '../src/runner/digest';
import { parseSimulationConfig } from '../src/core/config';
import { generateNetworkModel } from '../src/network/generator';
import { createValuationShockScenarios } from '../src/shocks/scenario';
import { createSimulationTreatment } from '../src/runner/treatment';
import { runSimulation } from '../src/runner/run';
import {
  parseControlThresholdCalibrationConfig,
  selectControlExperimentKappa,
} from '../src/calibration/control-threshold';

const root = resolve(import.meta.dirname, '..');
const readJson = (path: string): unknown => JSON.parse(readFileSync(resolve(root, path), 'utf8'));
const baseline = parseSimulationConfig(readJson('config/formal-baseline.json'));
const calibration = parseControlThresholdCalibrationConfig(
  readJson('config/control-threshold-calibration.json'),
);
const network = generateNetworkModel(baseline);
const counts = new Map(calibration.candidateKappaBps.map((value) => [
  value,
  { shocked: 0, noShock: 0 },
]));

for (let replicateId = 0; replicateId < calibration.replicates; replicateId += 1) {
  const scenario = createValuationShockScenarios(baseline, network, replicateId)
    .find(({ navDropBps }) => navDropBps === calibration.valuationShockBps);
  if (!scenario) throw new Error('CONTROL_THRESHOLD_SCENARIO_MISSING');
  for (const shockEnabled of [true, false]) {
    const result = runSimulation({
      treatment: createSimulationTreatment('control-threshold-pilot', baseline, calibration.regimeId),
      scenario,
      horizonDays: calibration.horizonDays,
      shockEnabled,
    });
    const maximumScore = Math.max(...result.finalState.oracleRiskSnapshots
      .filter((snapshot) => (
        snapshot.fundId === scenario.targetFundId && snapshot.submittedAt >= scenario.shockAt
      ))
      .map(({ riskScoreBps }) => riskScoreBps));
    for (const kappaBps of calibration.candidateKappaBps) {
      if (maximumScore <= kappaBps) continue;
      const count = counts.get(kappaBps)!;
      if (shockEnabled) count.shocked += 1;
      else count.noShock += 1;
    }
  }
}

const selected = selectControlExperimentKappa(calibration, counts);
const reportWithoutDigest = {
  schemaVersion: 1 as const,
  purpose: 'non-gating control-path reachability calibration; not a formal finding',
  formalFindingsAllowed: false as const,
  baselineConfigDigestSha256: semanticDigestSha256(baseline),
  calibrationConfigDigestSha256: semanticDigestSha256(calibration),
  ...selected,
};
const report = {
  ...reportWithoutDigest,
  semanticDigestSha256: semanticDigestSha256(reportWithoutDigest),
};
const outputPath = resolve(root, 'spec/control-threshold-calibration-evidence.json');
writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
