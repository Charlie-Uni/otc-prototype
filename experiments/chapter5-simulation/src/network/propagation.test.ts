import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { parseSimulationConfig, type SimulationConfig } from '../core/config';
import { queueRedemptionRequestsForFund, settlePendingRedemptions } from '../redemption/lifecycle';
import type { InvestorRedemptionIntent } from '../redemption/types';
import { createInitialSimulationState } from '../state/initialization';
import type { SimulationState } from '../state/types';
import { validateSimulationState } from '../state/validation';
import { generateNetworkModel } from './generator';
import { propagateNetworkEffects } from './propagation';

const baselineInput = JSON.parse(readFileSync(
  new URL('../../config/pilot-baseline.json', import.meta.url),
  'utf8',
)) as Record<string, Record<string, unknown>>;
const config = parseSimulationConfig(baselineInput);
const network = generateNetworkModel(config);
const AT = config.shock.cycleStartAt;

function initialState(): SimulationState {
  return createInitialSimulationState(network, AT);
}

function configWithChannels(
  channels: Partial<SimulationConfig['propagation']['channels']>,
): SimulationConfig {
  const input = structuredClone(baselineInput);
  input.propagation.channels = {
    ...(input.propagation.channels as Record<string, boolean>),
    ...channels,
  };
  return parseSimulationConfig(input);
}

function intentsForOne(state: SimulationState, fundId: string): InvestorRedemptionIntent[] {
  const largestHolder = state.holderBalances
    .filter((holding) => holding.fundId === fundId)
    .sort((left, right) => right.shares - left.shares)[0]!.investorId;
  return state.holderBalances
    .filter((holding) => holding.fundId === fundId && holding.shares > 0)
    .map((holding) => ({
      replicateId: 0,
      investorId: holding.investorId,
      fundId,
      tick: 0,
      redeem: holding.investorId === largestHolder,
    }));
}

function stateWithAssetSale(): SimulationState {
  const state = initialState();
  const fundId = 'fund-003';
  const queued = queueRedemptionRequestsForFund(
    state,
    network,
    fundId,
    intentsForOne(state, fundId),
    10_000,
  ).state;
  const settled = settlePendingRedemptions(queued, network, config).state;
  assert.ok(settled.assetSales.length > 0);
  return settled;
}

test('transmits an illiquid sale price impact to the same asset in other funds', () => {
  const state = stateWithAssetSale();
  const sale = state.assetSales[0]!;
  const targetPosition = state.assetPositions.find(({ fundId, assetClassId }) => (
    fundId !== sale.fundId && assetClassId === sale.assetClassId
  ))!;
  const beforePosition = targetPosition.value;
  const targetFund = state.funds.find(({ fundId }) => fundId === targetPosition.fundId)!;
  const beforeEconomicAum = targetFund.economicAum;
  const beforeReportedAum = targetFund.reportedAum;
  const result = propagateNetworkEffects(state, network, config, {
    replicateId: 0,
    tick: 0,
    propagatedAt: state.nowSec,
    assetSaleIds: [sale.saleId],
    signals: [],
  });
  const record = result.records.find(({ targetFundId }) => (
    targetFundId === targetPosition.fundId
  ))!;
  const afterPosition = result.state.assetPositions.find(({ fundId, assetClassId }) => (
    fundId === targetPosition.fundId && assetClassId === sale.assetClassId
  ))!.value;
  const afterFund = result.state.funds.find(({ fundId }) => fundId === targetPosition.fundId)!;

  assert.ok(record.transmittedLoss > 0);
  assert.equal(afterPosition, beforePosition - record.transmittedLoss);
  assert.equal(afterFund.economicAum, beforeEconomicAum - record.transmittedLoss);
  assert.equal(afterFund.reportedAum, beforeReportedAum);
  assert.throws(
    () => propagateNetworkEffects(result.state, network, config, {
      replicateId: 0,
      tick: 0,
      propagatedAt: state.nowSec,
      assetSaleIds: [sale.saleId],
      signals: [],
    }),
    /NETWORK_SOURCE_ALREADY_PROCESSED/,
  );
});

test('disabling the common-asset channel removes transmitted loss only', () => {
  const state = stateWithAssetSale();
  const sale = state.assetSales[0]!;
  const disabled = propagateNetworkEffects(
    state,
    network,
    configWithChannels({ sharedIlliquidAssets: false }),
    {
      replicateId: 0,
      tick: 0,
      propagatedAt: state.nowSec,
      assetSaleIds: [sale.saleId],
      signals: [],
    },
  );
  assert.ok(disabled.records.every(({ transmittedLoss }) => transmittedLoss === 0));
  assert.deepEqual(disabled.state.assetPositions, state.assetPositions);
  assert.deepEqual(disabled.state.funds, state.funds);
});

test('produces next-period redemption spillovers from overlap and public signals', () => {
  const state = initialState();
  const signals = [
    {
      sourceId: 'pressure:fund-001:t0',
      kind: 'redemption_pressure' as const,
      sourceFundId: 'fund-001',
      tick: 0,
      availableAt: AT,
      magnitudeBps: 4_000,
    },
    {
      sourceId: 'risk:fund-001:t0',
      kind: 'public_risk' as const,
      sourceFundId: 'fund-001',
      tick: 0,
      availableAt: AT,
      magnitudeBps: 8_000,
    },
    {
      sourceId: 'control:fund-001:t0',
      kind: 'public_control' as const,
      sourceFundId: 'fund-001',
      tick: 0,
      availableAt: AT,
      magnitudeBps: 10_000,
    },
  ];
  const result = propagateNetworkEffects(state, network, config, {
    replicateId: 0,
    tick: 0,
    propagatedAt: AT,
    assetSaleIds: [],
    signals,
  });

  assert.equal(result.records.length, signals.length * (network.funds.length - 1));
  assert.ok(result.targetSummaries.some(({ incomingSpilloverRedemptionBps }) => (
    incomingSpilloverRedemptionBps > 0
  )));
  assert.ok(result.records.filter(({ sourceKind }) => sourceKind === 'public_control')
    .every(({ sourceMagnitudeBps }) => sourceMagnitudeBps === 10_000));
});

test('channel ablations remove only their intended proximity components', () => {
  const state = initialState();
  const pressureSignal = {
    sourceId: 'pressure:fund-001:t0',
    kind: 'redemption_pressure' as const,
    sourceFundId: 'fund-001',
    tick: 0,
    availableAt: AT,
    magnitudeBps: 4_000,
  };
  const noOverlap = propagateNetworkEffects(
    state,
    network,
    configWithChannels({ investorOverlap: false }),
    {
      replicateId: 0,
      tick: 0,
      propagatedAt: AT,
      assetSaleIds: [],
      signals: [pressureSignal],
    },
  );
  assert.ok(noOverlap.records.every(({ spilloverRedemptionBps: value }) => value === 0));

  const riskSignal = { ...pressureSignal, sourceId: 'risk:fund-001:t0', kind: 'public_risk' as const };
  const full = propagateNetworkEffects(state, network, config, {
    replicateId: 0,
    tick: 0,
    propagatedAt: AT,
    assetSaleIds: [],
    signals: [riskSignal],
  });
  const noAnalogy = propagateNetworkEffects(
    state,
    network,
    configWithChannels({ signalAnalogy: false }),
    {
      replicateId: 0,
      tick: 0,
      propagatedAt: AT,
      assetSaleIds: [],
      signals: [riskSignal],
    },
  );
  const fullFund3 = full.records.find(({ targetFundId }) => targetFundId === 'fund-003')!;
  const noAnalogyFund3 = noAnalogy.records.find(({ targetFundId }) => targetFundId === 'fund-003')!;
  assert.ok(fullFund3.spilloverRedemptionBps > noAnalogyFund3.spilloverRedemptionBps);
  assert.equal(noAnalogyFund3.effectiveComponents.commonServiceOrManagerBps, 0);
  assert.equal(noAnalogyFund3.effectiveComponents.valuationMethodSimilarityBps, 0);
});

test('fails closed on future signals and corrupted propagation evidence', () => {
  const state = initialState();
  assert.throws(
    () => propagateNetworkEffects(state, network, config, {
      replicateId: 0,
      tick: 0,
      propagatedAt: AT,
      assetSaleIds: [],
      signals: [{
        sourceId: 'risk:future',
        kind: 'public_risk',
        sourceFundId: 'fund-001',
        tick: 0,
        availableAt: AT + 1,
        magnitudeBps: 8_000,
      }],
    }),
    /NETWORK_SIGNAL_NOT_AVAILABLE/,
  );
  assert.throws(
    () => propagateNetworkEffects(state, network, config, {
      replicateId: 0,
      tick: 0,
      propagatedAt: AT,
      assetSaleIds: [],
      signals: [
        {
          sourceId: 'risk:first',
          kind: 'public_risk',
          sourceFundId: 'fund-001',
          tick: 0,
          availableAt: AT,
          magnitudeBps: 8_000,
        },
        {
          sourceId: 'risk:second',
          kind: 'public_risk',
          sourceFundId: 'fund-001',
          tick: 0,
          availableAt: AT,
          magnitudeBps: 8_000,
        },
      ],
    }),
    /DUPLICATE_NETWORK_SIGNAL_SLOT/,
  );
  const result = propagateNetworkEffects(state, network, config, {
    replicateId: 0,
    tick: 0,
    propagatedAt: AT,
    assetSaleIds: [],
    signals: [{
      sourceId: 'risk:fund-001:t0',
      kind: 'public_risk',
      sourceFundId: 'fund-001',
      tick: 0,
      availableAt: AT,
      magnitudeBps: 8_000,
    }],
  });
  const corrupted = structuredClone(result.state);
  corrupted.networkPropagations[0]!.spilloverRedemptionBps += 1;
  assert.throws(() => validateSimulationState(corrupted, network), /SPILLOVER_REDEMPTION_MISMATCH/);
});
