import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { parseSimulationConfig } from '../core/config';
import { TICK_STAGES } from '../core/pipeline';
import { generateNetworkModel } from '../network/generator';
import { createValuationShockScenarios } from '../shocks/scenario';
import { runSimulation } from './run';
import { semanticDigestSha256 } from './digest';
import { createSimulationTreatment } from './treatment';

const baselineInput = JSON.parse(readFileSync(
  new URL('../../config/pilot-baseline.json', import.meta.url),
  'utf8',
)) as Record<string, Record<string, unknown>>;
const baseline = parseSimulationConfig(baselineInput);

function scenarioFor(config = baseline) {
  return createValuationShockScenarios(config, generateNetworkModel(config), 0)[1]!;
}

test('runs the frozen ten-stage pipeline and produces deterministic evidence', () => {
  const input = {
    treatment: createSimulationTreatment('r1-baseline', baseline, 'R1'),
    scenario: scenarioFor(),
    horizonDays: 3,
  } as const;
  const first = runSimulation(input);
  const second = runSimulation(input);

  assert.equal(first.traces.length, 3);
  assert.deepEqual(first.traces[0]!.stageOrder, TICK_STAGES);
  assert.equal(first.traces[0]!.shockApplied, true);
  assert.equal(first.traces[1]!.shockApplied, false);
  assert.ok(first.traces.every(({ oracle }) => oracle.length === 10));
  assert.ok(first.traces.every(({ funds }) => funds.length === 10));
  assert.equal(first.publicRiskDisclosures.length, 30);
  assert.equal(first.regulatorRiskDisclosures.length, 30);
  assert.equal(first.semanticDigestSha256, second.semanticDigestSha256);
  assert.deepEqual(second, first);
});

test('feeds network spillover into the next tick without changing the decision draw stream', () => {
  const input = structuredClone(baselineInput);
  input.behavior.coefficients = {
    interceptLogOdds: 20,
    perceivedRisk: 0,
    publicness: 0,
    signalSynchronicity: 0,
    expectedOthersRedeem: 0,
    firstMoverAdvantage: 0,
  };
  input.liquidity.redemptionRequestFractionBps = 100;
  const config = parseSimulationConfig(input);
  const result = runSimulation({
    treatment: createSimulationTreatment('forced-demand', config, 'R1'),
    scenario: scenarioFor(config),
    horizonDays: 2,
  });
  assert.ok(result.traces[0]!.queues.every(({ requestedShares }) => requestedShares > 0));
  assert.ok(result.traces[1]!.behavior.some(({ incomingSpilloverRedemptionBps }) => (
    incomingSpilloverRedemptionBps > 0
  )));
  assert.ok(result.traces[1]!.behavior.every((fund) => (
    fund.meanFinalProbabilityBps >= fund.meanBaseProbabilityBps
  )));
});

test('preserves R2 public control privacy while retaining regulator visibility', () => {
  const input = structuredClone(baselineInput);
  input.thresholds.baselineKappaBps = 0;
  input.thresholds.kappaScanBps = [0];
  const config = parseSimulationConfig(input);
  const result = runSimulation({
    treatment: createSimulationTreatment('r2-control-private', config, 'R2'),
    scenario: scenarioFor(config),
    horizonDays: 2,
  });
  assert.equal(result.publicControlDisclosures.length, 0);
  assert.ok(result.regulatorControlDisclosures.some(({ kind }) => kind === 'GateTriggered'));
});

test('applies the R3 delay to public and regulator observations in the full runner', () => {
  const result = runSimulation({
    treatment: createSimulationTreatment('r3-delayed', baseline, 'R3'),
    scenario: scenarioFor(),
    horizonDays: 2,
  });
  assert.equal(result.traces[0]!.newPublicRiskDisclosureIds.length, 0);
  assert.equal(result.traces[0]!.newRegulatorRiskDisclosureIds.length, 0);
  assert.equal(result.traces[1]!.newPublicRiskDisclosureIds.length, 10);
  assert.equal(result.traces[1]!.newRegulatorRiskDisclosureIds.length, 10);
  assert.ok(result.publicRiskDisclosures.every((disclosure) => (
    disclosure.disclosedAt - disclosure.sourceSubmittedAt === 86_400
  )));
});

test('completes the 90-day baseline with a stable semantic digest', { timeout: 15_000 }, () => {
  const result = runSimulation({
    treatment: createSimulationTreatment('baseline-90d', baseline, 'R1'),
    scenario: scenarioFor(),
  });
  assert.equal(result.traces.length, 90);
  assert.equal(result.finalState.redemptionRequests.length, 200);
  assert.equal(result.finalState.networkPropagations.length, 9_666);
  assert.equal(result.riskObservations.length, 131_400);
  assert.equal(result.configDigestSha256, semanticDigestSha256(baseline));
  assert.equal(
    result.semanticDigestSha256,
    '2db833964d3f362c1a661c50e88ec56f6044e5cae6bf1569a55ec4860e90bae1',
  );
});

test('fails fast on scenario drift, excessive horizon, and cross-tick Oracle attempts', () => {
  const treatment = createSimulationTreatment('baseline', baseline, 'R1');
  const scenario = scenarioFor();
  assert.throws(() => runSimulation({
    treatment,
    scenario: { ...scenario, targetFundId: 'fund-999' },
    horizonDays: 1,
  }), /SCENARIO_CONFIG_MISMATCH/);
  assert.throws(() => runSimulation({ treatment, scenario, horizonDays: 91 }),
    /INVALID_RUN_HORIZON_DAYS/);

  const delayedInput = structuredClone(baselineInput);
  delayedInput.oracle.baselineLatencySec = 86_400;
  const delayed = parseSimulationConfig(delayedInput);
  assert.throws(() => runSimulation({
    treatment: createSimulationTreatment('cross-tick', delayed, 'R1'),
    scenario: scenarioFor(delayed),
    horizonDays: 1,
  }), /ORACLE_ATTEMPTS_CROSS_TICK_BOUNDARY/);
});
