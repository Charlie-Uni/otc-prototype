import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { parseSimulationConfig } from '../core/config';
import { generateNetworkModel } from '../network/generator';
import { runSimulation } from '../runner/run';
import { createSimulationTreatment } from '../runner/treatment';
import { createValuationShockScenarios } from '../shocks/scenario';
import { extractRunOutcomeMetrics } from './outcomes';

const baselineInput = JSON.parse(readFileSync(
  new URL('../../config/pilot-baseline.json', import.meta.url),
  'utf8',
)) as Record<string, Record<string, unknown>>;

function scenarioFor(config: ReturnType<typeof parseSimulationConfig>) {
  return createValuationShockScenarios(config, generateNetworkModel(config), 0)[1]!;
}

test('extracts the mentor-confirmed 15-day pilot outcome definitions', () => {
  const config = parseSimulationConfig(baselineInput);
  const run = runSimulation({
    treatment: createSimulationTreatment('metric-baseline', config, 'R1'),
    scenario: scenarioFor(config),
    horizonDays: 15,
  });
  const metrics = extractRunOutcomeMetrics(run, config, 15);
  assert.equal(metrics.funds.length, 10);
  assert.equal(metrics.funds.filter(({ shocked }) => shocked).length, 1);
  assert.ok(metrics.funds.every((fund) => (
    fund.peakRedemptionBps >= 0
    && fund.pendingRateBps >= 0
    && fund.pendingRateBps <= 10_000
    && fund.liquidityBufferDepletionBps >= 0
    && fund.liquidityBufferDepletionBps <= 10_000
  )));
  assert.ok(metrics.funds.some(({ cumulativeRequestedShares }) => (
    cumulativeRequestedShares > 0
  )));
  assert.equal(metrics.detection.fundId, run.scenario.targetFundId);
});

test('adds normal settlement outflows back before measuring economic loss', () => {
  const input = structuredClone(baselineInput);
  input.behavior.coefficients = {
    interceptLogOdds: 20,
    perceivedRisk: 0,
    publicness: 0,
    signalSynchronicity: 0,
    expectedOthersRedeem: 0,
    firstMoverAdvantage: 0,
  };
  input.liquidity.redemptionRequestFractionBps = 10;
  input.propagation.sharedAssetPassThroughBps = 0;
  input.propagation.investorOverlapTransmissionBps = 0;
  input.propagation.publicRiskTransmissionBps = 0;
  input.propagation.publicControlTransmissionBps = 0;
  const config = parseSimulationConfig(input);
  const run = runSimulation({
    treatment: createSimulationTreatment('metric-flow-adjustment', config, 'R1'),
    scenario: scenarioFor(config),
    horizonDays: 1,
    shockEnabled: false,
  });
  const metrics = extractRunOutcomeMetrics(run, config, 1);
  assert.ok(metrics.funds.some(({ settledShares }) => settledShares > 0));
  assert.ok(metrics.funds.every(({ lossAmount }) => lossAmount === 0));
});

test('rejects windows that exceed the completed run', () => {
  const config = parseSimulationConfig(baselineInput);
  const run = runSimulation({
    treatment: createSimulationTreatment('metric-short-run', config, 'R1'),
    scenario: scenarioFor(config),
    horizonDays: 1,
  });
  assert.throws(() => extractRunOutcomeMetrics(run, config, 2),
    /INVALID_METRIC_WINDOW_DAYS/);
});
