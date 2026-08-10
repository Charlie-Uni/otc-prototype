import { ratioBps, signedRatioBps } from './math';
import type {
  ControlCostMetrics,
  FundRunOutcome,
  LossReductionMetrics,
  PairedFundDifference,
  RunOutcomeMetrics,
  SpilloverScopeMetrics,
} from './outcome-types';

function assertPairedOutcomes(
  treatment: RunOutcomeMetrics,
  counterfactual: RunOutcomeMetrics,
): void {
  if (
    treatment.replicateId !== counterfactual.replicateId
    || treatment.scenarioId !== counterfactual.scenarioId
    || treatment.shockAt !== counterfactual.shockAt
    || treatment.windowDays !== counterfactual.windowDays
  ) throw new Error('UNPAIRED_OUTCOME_METRICS');
  const treatmentIds = treatment.funds.map(({ fundId }) => fundId).sort();
  const counterfactualIds = counterfactual.funds.map(({ fundId }) => fundId).sort();
  if (JSON.stringify(treatmentIds) !== JSON.stringify(counterfactualIds)) {
    throw new Error('PAIRED_OUTCOME_FUND_SET_MISMATCH');
  }
  const counterfactualByFund = byFundId(counterfactual);
  if (treatment.funds.some((fund) => {
    const paired = counterfactualByFund.get(fund.fundId)!;
    return fund.initialAum !== paired.initialAum
      || fund.initialTotalShares !== paired.initialTotalShares
      || fund.shocked !== paired.shocked;
  })) throw new Error('PAIRED_OUTCOME_INITIAL_STATE_MISMATCH');
}

function byFundId(outcome: RunOutcomeMetrics): Map<string, FundRunOutcome> {
  return new Map(outcome.funds.map((fund) => [fund.fundId, fund]));
}

export function pairedFundRequestDifferences(
  treatment: RunOutcomeMetrics,
  counterfactual: RunOutcomeMetrics,
): PairedFundDifference[] {
  assertPairedOutcomes(treatment, counterfactual);
  const counterfactualByFund = byFundId(counterfactual);
  return treatment.funds.map((fund) => {
    const paired = counterfactualByFund.get(fund.fundId)!;
    return {
      fundId: fund.fundId,
      shocked: fund.shocked,
      treatmentRequestRateBps: fund.cumulativeRequestRateBps,
      counterfactualRequestRateBps: paired.cumulativeRequestRateBps,
      excessRequestRateBps: fund.cumulativeRequestRateBps - paired.cumulativeRequestRateBps,
    };
  }).sort((left, right) => left.fundId.localeCompare(right.fundId));
}

export function redemptionAccelerationBps(
  treatment: RunOutcomeMetrics,
  counterfactual: RunOutcomeMetrics,
  fundIds?: ReadonlySet<string>,
): number {
  assertPairedOutcomes(treatment, counterfactual);
  const selected = treatment.funds.filter(({ fundId }) => !fundIds || fundIds.has(fundId));
  if (selected.length === 0) throw new Error('EMPTY_REDEMPTION_ACCELERATION_FUND_SET');
  const counterfactualByFund = byFundId(counterfactual);
  const denominator = selected.reduce((sum, fund) => sum + fund.initialTotalShares, 0);
  const excessShares = selected.reduce((sum, fund) => (
    sum + fund.cumulativeRequestedShares
      - counterfactualByFund.get(fund.fundId)!.cumulativeRequestedShares
  ), 0);
  return signedRatioBps(excessShares, denominator, 'REDEMPTION_ACCELERATION');
}

export function spilloverScope(
  networkTreatment: RunOutcomeMetrics,
  disabledCounterfactual: RunOutcomeMetrics,
  thresholdBps = 500,
): SpilloverScopeMetrics {
  if (!Number.isInteger(thresholdBps) || thresholdBps < 0) {
    throw new Error('INVALID_SPILLOVER_SCOPE_THRESHOLD_BPS');
  }
  const byFund = pairedFundRequestDifferences(
    networkTreatment,
    disabledCounterfactual,
  ).filter(({ shocked }) => !shocked);
  if (byFund.length === 0) throw new Error('NO_UNSHOCKED_FUNDS_FOR_SPILLOVER_SCOPE');
  const affectedFundCount = byFund.filter(({ excessRequestRateBps }) => (
    excessRequestRateBps > thresholdBps
  )).length;
  return {
    thresholdBps,
    unshockedFundCount: byFund.length,
    meanContinuousSpilloverBps: Math.trunc(
      byFund.reduce((sum, fund) => sum + fund.excessRequestRateBps, 0) / byFund.length,
    ),
    affectedFundCount,
    affectedFundShareBps: ratioBps(
      affectedFundCount,
      byFund.length,
      'SPILLOVER_AFFECTED_FUND_SHARE',
    ),
    byFund,
  };
}

export function publicControlSpillover(
  publicControl: RunOutcomeMetrics,
  privateControl: RunOutcomeMetrics,
  thresholdBps = 500,
): SpilloverScopeMetrics {
  return spilloverScope(publicControl, privateControl, thresholdBps);
}

function aggregateLossMagnitudeBps(outcome: RunOutcomeMetrics): number {
  return ratioBps(
    outcome.funds.reduce((sum, fund) => sum + fund.lossAmount, 0),
    outcome.funds.reduce((sum, fund) => sum + fund.initialAum, 0),
    'AGGREGATE_LOSS_MAGNITUDE',
  );
}

export function lossReduction(
  control: RunOutcomeMetrics,
  noControl: RunOutcomeMetrics,
): LossReductionMetrics {
  assertPairedOutcomes(control, noControl);
  const noControlLossMagnitudeBps = aggregateLossMagnitudeBps(noControl);
  const controlLossMagnitudeBps = aggregateLossMagnitudeBps(control);
  const absoluteReductionBps = noControlLossMagnitudeBps - controlLossMagnitudeBps;
  return {
    noControlLossMagnitudeBps,
    controlLossMagnitudeBps,
    absoluteReductionBps,
    relativeReductionBps: noControlLossMagnitudeBps === 0
      ? null
      : signedRatioBps(
        absoluteReductionBps,
        noControlLossMagnitudeBps,
        'RELATIVE_LOSS_REDUCTION',
      ),
  };
}

export function controlCost(outcome: RunOutcomeMetrics): ControlCostMetrics {
  const totalLatentShares = outcome.funds.reduce(
    (sum, fund) => sum + fund.cumulativeLatentRequestedShares,
    0,
  );
  const blockedShares = outcome.funds.reduce(
    (sum, fund) => sum + fund.blockedSharesByGate,
    0,
  );
  const requestedShares = outcome.funds.reduce(
    (sum, fund) => sum + fund.cumulativeRequestedShares,
    0,
  );
  const pendingShares = outcome.funds.reduce((sum, fund) => sum + fund.pendingShares, 0);
  const settledDelayRows = outcome.funds.filter((fund) => (
    fund.averageExtraWaitingSec !== null && fund.settlementDelay.settledRequestCount > 0
  ));
  const settledRequestCount = settledDelayRows.reduce(
    (sum, fund) => sum + fund.settlementDelay.settledRequestCount,
    0,
  );
  const totalExtraWaitingSec = settledDelayRows.reduce(
    (sum, fund) => sum + BigInt(fund.totalExtraWaitingSec),
    0n,
  );
  return {
    gateFrozenShareRatioBps: totalLatentShares === 0
      ? 0
      : ratioBps(blockedShares, totalLatentShares, 'AGGREGATE_GATE_FROZEN_SHARE_RATIO'),
    averageExtraWaitingSec: settledRequestCount === 0
      ? null
      : Number(totalExtraWaitingSec / BigInt(settledRequestCount)),
    pendingRateBps: requestedShares === 0
      ? 0
      : ratioBps(pendingShares, requestedShares, 'AGGREGATE_PENDING_RATE'),
  };
}
