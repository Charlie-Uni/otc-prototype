import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseFormalAnalysisPlan } from '../src/preregistration/analysis-plan';
import { parseFormalExperimentDesign } from '../src/preregistration/design';
import { parseSimulationConfig } from '../src/core/config';
import { generateFormalExperimentMatrix } from '../src/preregistration/matrix';
import { semanticDigestSha256 } from '../src/runner/digest';
import {
  parseControlThresholdCalibrationConfig,
  parseControlThresholdEvidence,
} from '../src/calibration/control-threshold';

const root = resolve(import.meta.dirname, '..');
const readJson = (path: string): unknown => JSON.parse(readFileSync(resolve(root, path), 'utf8'));
const stable = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`;

const plan = parseFormalAnalysisPlan(readJson('config/formal-analysis-plan.json'));
const design = parseFormalExperimentDesign(readJson('config/formal-experiment-design.json'));
const baseline = parseSimulationConfig(readJson('config/formal-baseline.json'));
const matrix = readJson('spec/formal-experiment-matrix.json');
const expectedMatrix = generateFormalExperimentMatrix(design);
const controlCalibration = parseControlThresholdCalibrationConfig(
  readJson('config/control-threshold-calibration.json'),
);
const controlEvidence = parseControlThresholdEvidence(
  controlCalibration,
  readJson('spec/control-threshold-calibration-evidence.json'),
);

if (plan.replications.formalPerCell !== design.formalReplicates
  || plan.replications.formalPerCell !== baseline.monteCarlo.formalMinimumReplicatesPerCell) {
  throw new Error('FORMAL_REPLICATION_POLICY_MISMATCH');
}
if (plan.replications.keyRobustnessPerCell !== design.keyRobustnessReplicates
  || plan.replications.keyRobustnessPerCell !== baseline.monteCarlo.keyRobustnessReplicatesPerCell) {
  throw new Error('ROBUSTNESS_REPLICATION_POLICY_MISMATCH');
}
if (plan.detection.sensitivityThresholdBps !== baseline.thresholds.detectionBps) {
  throw new Error('DETECTION_SENSITIVITY_THRESHOLD_MISMATCH');
}
if (baseline.thresholds.baselineKappaBps !== plan.controlExperiment.artifactPolicyBaselineKappaBps
  || design.controlExperimentKappaBps !== plan.controlExperiment.mechanismExperimentKappaBps
  || controlEvidence.selectedKappaBps !== design.controlExperimentKappaBps) {
  throw new Error('CONTROL_EXPERIMENT_KAPPA_MISMATCH');
}
if (controlEvidence.baselineConfigDigestSha256 !== semanticDigestSha256(baseline)
  || controlEvidence.calibrationConfigDigestSha256 !== semanticDigestSha256(controlCalibration)) {
  throw new Error('CONTROL_THRESHOLD_EVIDENCE_CONFIG_DIGEST_MISMATCH');
}
const { semanticDigestSha256: recordedControlDigest, ...controlEvidenceWithoutDigest } = controlEvidence;
if (recordedControlDigest !== semanticDigestSha256(controlEvidenceWithoutDigest)) {
  throw new Error('CONTROL_THRESHOLD_EVIDENCE_SEMANTIC_DIGEST_MISMATCH');
}
for (const id of ['A6', 'CONTROL_PHI', 'CONTROL_RELEASE_STREAK', 'CONTROL_RELEASE_DELAY']) {
  const cells = expectedMatrix.cells.filter((cell) => (
    cell.pairId === id || cell.pairId.startsWith(`ROBUST-${id}-`)
  ));
  if (cells.length === 0 || cells.some((cell) => !cell.treatmentChanges.some((change) => (
    change.path === 'config.thresholds.baselineKappaBps'
      && change.value === design.controlExperimentKappaBps
  )))) throw new Error(`CONTROL_EXPERIMENT_KAPPA_NOT_APPLIED:${id}`);
}
if (stable(matrix) !== stable(expectedMatrix)) {
  throw new Error('FORMAL_MATRIX_CONTENT_MISMATCH');
}
process.stdout.write('Formal analysis plan, baseline, design, and matrix verified\n');
