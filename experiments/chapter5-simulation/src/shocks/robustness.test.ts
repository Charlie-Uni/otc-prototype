import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { parseSimulationConfig } from '../core/config';
import { generateNetworkModel } from '../network/generator';
import { runSimulation } from '../runner/run';
import { createSimulationTreatment } from '../runner/treatment';
import { createInitialSimulationState } from '../state/initialization';
import { validateSimulationState } from '../state/validation';
import { applyLiquidityShock } from './liquidity';
import { applyRedemptionShock } from './redemption';
import { createShockScenario } from './scenario';

const config = parseSimulationConfig(JSON.parse(readFileSync(
  new URL('../../config/formal-baseline.json', import.meta.url),
  'utf8',
)) as unknown);
const network = generateNetworkModel(config);

test('liquidity shock impairs the buffer without creating an economic loss', () => {
  const scenario = createShockScenario(config, network, 3, 'liquidity', 2_000);
  assert.equal(scenario.shockType, 'liquidity');
  if (scenario.shockType !== 'liquidity') throw new Error('EXPECTED_LIQUIDITY_SCENARIO');
  const initial = createInitialSimulationState(network, scenario.shockAt);
  const targetBefore = initial.funds.find(({ fundId }) => fundId === scenario.targetFundId)!;
  const shocked = applyLiquidityShock(initial, network, scenario);
  const targetAfter = shocked.funds.find(({ fundId }) => fundId === scenario.targetFundId)!;
  const evidence = shocked.appliedRobustnessShocks?.[0];

  assert.equal(evidence?.shockType, 'liquidity');
  assert.equal(targetAfter.economicAum, targetBefore.economicAum);
  assert.equal(targetAfter.reportedAum, targetBefore.reportedAum);
  if (evidence?.shockType !== 'liquidity') throw new Error('MISSING_LIQUIDITY_EVIDENCE');
  assert.equal(
    evidence.postShockLiquidityShortfallBps,
    Math.min(10_000, evidence.preShockLiquidityShortfallBps + 2_000),
  );
  assert.equal(
    evidence.postShockLiquidAssetValue,
    evidence.preShockLiquidAssetValue - evidence.reclassifiedAmount,
  );

  const shockedRun = runSimulation({
    treatment: createSimulationTreatment('liquidity-shock', config, 'R1'),
    scenario,
    horizonDays: 1,
  });
  const noShockRun = runSimulation({
    treatment: createSimulationTreatment('liquidity-no-shock', config, 'R1'),
    scenario,
    horizonDays: 1,
    shockEnabled: false,
  });
  const targetMetric = (result: typeof shockedRun) => result.finalState.oracleRiskSnapshots
    .find(({ fundId }) => fundId === scenario.targetFundId)!.metrics.liquidityShortfallBps;
  assert.ok(targetMetric(shockedRun) > targetMetric(noShockRun));
});

test('redemption shock creates exact registered requests and reaches the Oracle pressure metric', () => {
  const scenario = createShockScenario(config, network, 4, 'redemption', 2_000);
  assert.equal(scenario.shockType, 'redemption');
  if (scenario.shockType !== 'redemption') throw new Error('EXPECTED_REDEMPTION_SCENARIO');
  const initial = createInitialSimulationState(network, scenario.shockAt);
  const shocked = applyRedemptionShock(initial, network, scenario);
  const evidence = shocked.appliedRobustnessShocks?.[0];
  assert.equal(evidence?.shockType, 'redemption');
  if (evidence?.shockType !== 'redemption') throw new Error('MISSING_REDEMPTION_EVIDENCE');
  assert.equal(evidence.requestedShares, 20_000_000);
  assert.equal(evidence.preShockTotalShares, 100_000_000);
  assert.equal(
    shocked.redemptionRequests.reduce((sum, request) => sum + request.requestedShares, 0),
    evidence.requestedShares,
  );

  const result = runSimulation({
    treatment: createSimulationTreatment('redemption-shock', config, 'R1'),
    scenario,
    horizonDays: 1,
  });
  const targetSnapshot = result.finalState.oracleRiskSnapshots.find(({ fundId }) => (
    fundId === scenario.targetFundId
  ))!;
  assert.equal(targetSnapshot.metrics.redemptionPressureBps, 2_000);

  const noShock = runSimulation({
    treatment: createSimulationTreatment('redemption-no-shock', config, 'R1'),
    scenario,
    horizonDays: 1,
    shockEnabled: false,
  });
  const counterfactual = noShock.finalState.oracleRiskSnapshots.find(({ fundId }) => (
    fundId === scenario.targetFundId
  ))!;
  assert.ok(
    targetSnapshot.metrics.redemptionPressureBps
      > counterfactual.metrics.redemptionPressureBps,
  );
});

test('rejects tampered robustness-shock evidence', () => {
  const liquidityScenario = createShockScenario(config, network, 3, 'liquidity', 2_000);
  if (liquidityScenario.shockType !== 'liquidity') throw new Error('EXPECTED_LIQUIDITY_SCENARIO');
  const liquidityState = applyLiquidityShock(
    createInitialSimulationState(network, liquidityScenario.shockAt),
    network,
    liquidityScenario,
  );
  const tamperedLiquidity = structuredClone(liquidityState);
  const liquidityEvidence = tamperedLiquidity.appliedRobustnessShocks?.[0];
  if (liquidityEvidence?.shockType !== 'liquidity') throw new Error('MISSING_LIQUIDITY_EVIDENCE');
  liquidityEvidence.postShockLiquidityShortfallBps += 1;
  assert.throws(
    () => validateSimulationState(tamperedLiquidity, network),
    /APPLIED_LIQUIDITY_SHOCK_ACCOUNTING_MISMATCH/,
  );

  const redemptionScenario = createShockScenario(config, network, 4, 'redemption', 2_000);
  if (redemptionScenario.shockType !== 'redemption') throw new Error('EXPECTED_REDEMPTION_SCENARIO');
  const redemptionState = applyRedemptionShock(
    createInitialSimulationState(network, redemptionScenario.shockAt),
    network,
    redemptionScenario,
  );
  const tamperedRedemption = structuredClone(redemptionState);
  const redemptionEvidence = tamperedRedemption.appliedRobustnessShocks?.[0];
  if (redemptionEvidence?.shockType !== 'redemption') throw new Error('MISSING_REDEMPTION_EVIDENCE');
  redemptionEvidence.preShockTotalShares += 1;
  assert.throws(
    () => validateSimulationState(tamperedRedemption, network),
    /REDEMPTION_SHOCK_PRE_SHOCK_TOTAL_SHARES_MISMATCH/,
  );
});

test('all shock types share paired time and target coordinates for one replicate', () => {
  const scenarios = ['valuation', 'liquidity', 'redemption'].map((shockType) => (
    createShockScenario(config, network, 11, shockType as 'valuation' | 'liquidity' | 'redemption', 2_000)
  ));
  assert.equal(new Set(scenarios.map(({ shockAt }) => shockAt)).size, 1);
  assert.equal(new Set(scenarios.map(({ targetFundId }) => targetFundId)).size, 1);
  assert.equal(new Set(scenarios.map(({ cycleOffsetSec }) => cycleOffsetSec)).size, 1);
});

test('Oracle request pressure uses the rolling interval (t-w,t]', () => {
  const windowConfig = parseSimulationConfig({
    ...structuredClone(config),
    time: {
      ...config.time,
      horizonDays: 2,
      primaryWindowDays: 1,
      robustnessWindowDays: [1],
    },
    behavior: {
      ...config.behavior,
      coefficients: {
        interceptLogOdds: -20,
        perceivedRisk: 0,
        publicness: 0,
        signalSynchronicity: 0,
        expectedOthersRedeem: 0,
        firstMoverAdvantage: 0,
      },
    },
  });
  const windowNetwork = generateNetworkModel(windowConfig);
  const scenario = createShockScenario(windowConfig, windowNetwork, 4, 'redemption', 2_000);
  const result = runSimulation({
    treatment: createSimulationTreatment('redemption-window', windowConfig, 'R1'),
    scenario,
    horizonDays: 2,
  });
  const pressureByTick = result.finalState.oracleRiskSnapshots
    .filter(({ fundId }) => fundId === scenario.targetFundId)
    .sort((left, right) => left.tick - right.tick)
    .map(({ metrics }) => metrics.redemptionPressureBps);
  assert.deepEqual(pressureByTick, [2_000, 0]);
});
