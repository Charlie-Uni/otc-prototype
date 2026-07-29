import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { ACCESS_POLICY, auditActorFor, requireAnyRole } from '../auth';
import { waitForTransactionTimestamp } from '../audit/chain-time';
import { listAuditEntries, recordAudit } from '../audit/log';
import { fundId, liquidityRiskRegistry, nav, regulatorRiskRegistry, riskRegistry, rpc, token } from '../chain';
import { ENV } from '../env';
import {
  RiskMetrics,
  computeInvestorConcentrationBps,
  computeLiquidityShortfallBps,
  normalizeStalePricingRiskBps,
} from '../risk/calc';
import { HolderShareSnapshot, readHolderShareSnapshot } from '../risk/holdings';
import { RedemptionPressureSnapshot, readRedemptionPressureSnapshot } from '../risk/redemptions';
import {
  RiskSnapshotContext,
  validateRiskSnapshotTime,
} from '../risk/snapshot-context';
import { SourceFreshness, evaluateSourceFreshness } from '../risk/source-freshness';
import {
  disclosedControlState,
  latestControlTransition,
  latestDisclosedControlTransition,
} from '../risk/control-state';
import { readControlTransitions } from '../risk/controls';
import { searchLatestDisclosedSnapshot } from '../risk/disclosure-search';
import { submitRiskWithOneConfigRetry } from '../risk/submit-retry';
import {
  RISK_PAYLOAD_SCHEMA_VERSION,
  STALE_REFERENCE_USED,
  riskPayloadHashV3,
} from '../risk/payload-commitment';
import {
  TRANSPARENCY_REGIME_IDS,
  TransparencyRegime,
  TransparencyRegimeId,
  buildRegulatorRiskPayload,
  buildPublicRiskPayload,
  buildUnavailablePublicRiskPayload,
  buildUnavailableRegulatorRiskPayload,
  disclosureTimeFor,
  getTransparencyRegime,
  regulatorUsesDisclosureBoundary,
  resolvePublicRegimeId,
} from '../risk/regimes';

const PublicRiskQuerySchema = z.object({
  regime: z.enum(TRANSPARENCY_REGIME_IDS).optional(),
});
const ReleaseGateSchema = z.object({
  reasonHash: z.string()
    .regex(/^0x[0-9a-fA-F]{64}$/, 'reasonHash must be bytes32')
    .refine((value) => !/^0x0{64}$/i.test(value), 'reasonHash must be non-zero'),
});

const SubmitRiskSchema = z.object({
  occurredAt: z.coerce.number().int().positive(),
}).strict();
const RiskAuditQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(1_000).default(100),
});
type WeightsConfig = {
  id: number;
  maxStaleAgeSec: number;
  weightsHash: `0x${string}`;
};

type ResolvedRiskInput = z.infer<typeof SubmitRiskSchema> & {
  valuationHaircutBps: number;
  holderSharesBps: number[];
  redemptionPressureBps: number;
  redemptionQueueRatioBps: number;
  liquidityBufferRatioBps: number;
  lastValuationAsOf: number;
  lastValuationStoredAt: number;
};

type ComputedRisk = {
  snapshotContext: RiskSnapshotContext;
  config: WeightsConfig;
  metrics: RiskMetrics;
  payloadHash: `0x${string}`;
  valuationHaircutSource: 'chain';
  lastValuationUpdateAt: number;
  lastValuationAsOf: number;
  lastValuationStoredAt: number;
  staleAgeFromAsOfSec: number;
  staleAgeFromStoredAtSec: number;
  staleReferenceUsed: typeof STALE_REFERENCE_USED;
  holderSource: 'chain';
  redemptionPressureSource: 'chain';
  redemptionQueueSource: 'chain';
  liquidityBufferSource: 'chain';
  stalePricingSource: 'chain';
  holderSnapshot: HolderShareSnapshot;
  redemptionPressureSnapshot: RedemptionPressureSnapshot;
  valuationHaircutSnapshot: {
    valuationHaircutBps: number;
    occurredAt: number;
    submittedAt: number;
    payloadHash: `0x${string}`;
    submittedBy: `0x${string}`;
  };
  liquidityBufferSnapshot: {
    liquidityBufferRatioBps: number;
    occurredAt: number;
    submittedAt: number;
    payloadHash: `0x${string}`;
    submittedBy: `0x${string}`;
  };
  valuationHaircutFreshness: SourceFreshness;
  liquidityBufferFreshness: SourceFreshness;
};

type RiskSnapshot = {
  fundId: `0x${string}`;
  metrics: RiskMetrics;
  riskScoreBps: number;
  kappaBps: number;
  weightsConfigId: number;
  occurredAt: number;
  submittedAt: number;
  metricsHash: `0x${string}`;
  payloadHash: `0x${string}`;
  submittedBy: `0x${string}`;
};

function nowSec(): number {
  return Math.floor(Date.now() / 1000);
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function normalizeMetrics(raw: any): RiskMetrics {
  return {
    valuationHaircutBps: Number(raw.valuationHaircutBps ?? raw[0]),
    redemptionPressureBps: Number(raw.redemptionPressureBps ?? raw[1]),
    redemptionQueueRatioBps: Number(raw.redemptionQueueRatioBps ?? raw[2]),
    liquidityShortfallBps: Number(raw.liquidityShortfallBps ?? raw[3]),
    stalePricingRiskBps: Number(raw.stalePricingRiskBps ?? raw[4]),
    investorConcentrationBps: Number(raw.investorConcentrationBps ?? raw[5]),
  };
}

function normalizeSnapshot(raw: any): RiskSnapshot {
  const metrics = raw.metrics ?? raw[1];
  return {
    fundId: raw.fundId ?? raw[0],
    metrics: normalizeMetrics(metrics),
    riskScoreBps: Number(raw.riskScoreBps ?? raw[2]),
    kappaBps: Number(raw.kappaBps ?? raw[3]),
    weightsConfigId: Number(raw.weightsConfigId ?? raw[4]),
    occurredAt: Number(raw.occurredAt ?? raw[5]),
    submittedAt: Number(raw.submittedAt ?? raw[6]),
    metricsHash: raw.metricsHash ?? raw[7],
    payloadHash: raw.payloadHash ?? raw[8],
    submittedBy: raw.submittedBy ?? raw[9],
  };
}

async function captureRiskSnapshotContext(): Promise<RiskSnapshotContext> {
  const [block, chainId] = await Promise.all([
    rpc.getBlock({ blockTag: 'latest' }),
    rpc.getChainId(),
  ]);
  if (block.number === null) {
    throw new Error('SNAPSHOT_BLOCK_NUMBER_UNAVAILABLE');
  }
  return {
    chainId,
    blockNumber: block.number,
    blockTimestamp: Number(block.timestamp),
  };
}

async function readActiveWeightsConfig(context: RiskSnapshotContext): Promise<WeightsConfig> {
  const c = riskRegistry as any;
  const activeId = Number(await c.read.activeWeightsConfigId({ blockNumber: context.blockNumber }));
  const [, maxStaleAgeRaw, weightsHash, exists] = await c.read.getWeightsConfig(
    [BigInt(activeId)],
    { blockNumber: context.blockNumber },
  );
  if (!exists) {
    throw new Error('ACTIVE_WEIGHTS_NOT_FOUND');
  }

  return {
    id: activeId,
    maxStaleAgeSec: Number(maxStaleAgeRaw),
    weightsHash,
  };
}

async function resolveHolderShares(context: RiskSnapshotContext) {
  const holderSnapshot = await readHolderShareSnapshot(context.blockNumber);
  return {
    holderSharesBps: holderSnapshot.holderSharesBps,
    holderSource: 'chain' as const,
    holderSnapshot,
  };
}

async function resolveRedemptionQueueRatio(context: RiskSnapshotContext) {
  const c = token as any;
  const redemptionQueueRatioBps = Number(
    await c.read.redemptionQueueRatioBps({ blockNumber: context.blockNumber }),
  );
  return {
    redemptionQueueRatioBps,
    redemptionQueueSource: 'chain' as const,
  };
}

async function resolveRedemptionPressure(
  body: z.infer<typeof SubmitRiskSchema>,
  context: RiskSnapshotContext,
) {
  const redemptionPressureSnapshot = await readRedemptionPressureSnapshot(
    body.occurredAt,
    ENV.REDEMPTION_PRESSURE_WINDOW_SEC,
    context.blockNumber,
  );
  return {
    redemptionPressureBps: redemptionPressureSnapshot.redemptionPressureBps,
    redemptionPressureSource: 'chain' as const,
    redemptionPressureSnapshot,
  };
}

async function resolveValuationTiming(
  body: z.infer<typeof SubmitRiskSchema>,
  context: RiskSnapshotContext,
) {
  const c = nav as any;
  const raw = await c.read.latestNAV([fundId], { blockNumber: context.blockNumber });
  const asOf = Number(raw.asOf ?? raw[3]);
  const storedAt = Number(raw.storedAt ?? raw[4]);
  if (storedAt > body.occurredAt) {
    throw new Error('NAV_STORED_AFTER_OCCURRED_AT');
  }
  if (asOf > body.occurredAt) {
    throw new Error('NAV_AS_OF_AFTER_OCCURRED_AT');
  }

  return {
    lastValuationUpdateAt: storedAt,
    lastValuationAsOf: asOf,
    lastValuationStoredAt: storedAt,
    staleAgeFromAsOfSec: body.occurredAt - asOf,
    staleAgeFromStoredAtSec: body.occurredAt - storedAt,
    staleReferenceUsed: STALE_REFERENCE_USED,
    stalePricingSource: 'chain' as const,
  };
}

async function resolveValuationHaircut(
  body: z.infer<typeof SubmitRiskSchema>,
  context: RiskSnapshotContext,
) {
  const c = nav as any;
  const raw = await c.read.latestValuationHaircut(
    [fundId],
    { blockNumber: context.blockNumber },
  );
  const valuationHaircutSnapshot = {
    valuationHaircutBps: Number(raw.valuationHaircutBps ?? raw[0]),
    occurredAt: Number(raw.occurredAt ?? raw[1]),
    submittedAt: Number(raw.submittedAt ?? raw[2]),
    payloadHash: (raw.payloadHash ?? raw[3]) as `0x${string}`,
    submittedBy: (raw.submittedBy ?? raw[4]) as `0x${string}`,
  };
  if (valuationHaircutSnapshot.occurredAt > body.occurredAt) {
    throw new Error('VALUATION_HAIRCUT_OCCURRED_AFTER_RISK');
  }
  return {
    valuationHaircutBps: valuationHaircutSnapshot.valuationHaircutBps,
    valuationHaircutSource: 'chain' as const,
    valuationHaircutFreshness: evaluateSourceFreshness(
      body.occurredAt,
      valuationHaircutSnapshot.occurredAt,
      ENV.MAX_VALUATION_HAIRCUT_AGE_SEC,
    ),
    valuationHaircutSnapshot,
  };
}

async function resolveLiquidityBuffer(
  body: z.infer<typeof SubmitRiskSchema>,
  context: RiskSnapshotContext,
) {
  const c = liquidityRiskRegistry as any;
  const raw = await c.read.latestLiquidityBuffer(
    [fundId],
    { blockNumber: context.blockNumber },
  );
  const liquidityBufferSnapshot = {
    liquidityBufferRatioBps: Number(raw.liquidityBufferRatioBps ?? raw[0]),
    occurredAt: Number(raw.occurredAt ?? raw[1]),
    submittedAt: Number(raw.submittedAt ?? raw[2]),
    payloadHash: (raw.payloadHash ?? raw[3]) as `0x${string}`,
    submittedBy: (raw.submittedBy ?? raw[4]) as `0x${string}`,
  };
  if (liquidityBufferSnapshot.occurredAt > body.occurredAt) {
    throw new Error('LIQUIDITY_BUFFER_OCCURRED_AFTER_RISK');
  }
  return {
    liquidityBufferRatioBps: liquidityBufferSnapshot.liquidityBufferRatioBps,
    liquidityBufferSource: 'chain' as const,
    liquidityBufferFreshness: evaluateSourceFreshness(
      body.occurredAt,
      liquidityBufferSnapshot.occurredAt,
      ENV.MAX_LIQUIDITY_BUFFER_AGE_SEC,
    ),
    liquidityBufferSnapshot,
  };
}

function buildMetrics(body: ResolvedRiskInput, config: WeightsConfig): RiskMetrics {
  const staleAgeSec = body.occurredAt - body.lastValuationStoredAt;
  return {
    valuationHaircutBps: body.valuationHaircutBps,
    redemptionPressureBps: body.redemptionPressureBps,
    redemptionQueueRatioBps: body.redemptionQueueRatioBps,
    liquidityShortfallBps: computeLiquidityShortfallBps(body.liquidityBufferRatioBps),
    stalePricingRiskBps: normalizeStalePricingRiskBps(staleAgeSec, config.maxStaleAgeSec),
    investorConcentrationBps: computeInvestorConcentrationBps(body.holderSharesBps),
  };
}

function payloadHashFor(
  body: ResolvedRiskInput,
  metrics: RiskMetrics,
  config: WeightsConfig,
  context: RiskSnapshotContext,
  valuationState: Awaited<ReturnType<typeof resolveValuationHaircut>>,
  liquidityState: Awaited<ReturnType<typeof resolveLiquidityBuffer>>,
) {
  return riskPayloadHashV3({
    chainId: context.chainId,
    riskRegistryAddress: ENV.RISK_REGISTRY_ADDRESS,
    fundId,
    snapshotBlockNumber: context.blockNumber,
    snapshotBlockTimestamp: context.blockTimestamp,
    occurredAt: body.occurredAt,
    valuationHaircutBps: body.valuationHaircutBps,
    redemptionPressureBps: body.redemptionPressureBps,
    redemptionQueueRatioBps: body.redemptionQueueRatioBps,
    liquidityBufferRatioBps: body.liquidityBufferRatioBps,
    lastValuationAsOf: body.lastValuationAsOf,
    lastValuationStoredAt: body.lastValuationStoredAt,
    holderSharesBps: body.holderSharesBps,
    metrics,
    weightsConfigId: config.id,
    maxStaleAgeSec: config.maxStaleAgeSec,
    weightsHash: config.weightsHash,
    valuationHaircut: {
      occurredAt: valuationState.valuationHaircutSnapshot.occurredAt,
      submittedAt: valuationState.valuationHaircutSnapshot.submittedAt,
      payloadHash: valuationState.valuationHaircutSnapshot.payloadHash,
      freshness: valuationState.valuationHaircutFreshness,
    },
    liquidityBuffer: {
      occurredAt: liquidityState.liquidityBufferSnapshot.occurredAt,
      submittedAt: liquidityState.liquidityBufferSnapshot.submittedAt,
      payloadHash: liquidityState.liquidityBufferSnapshot.payloadHash,
      freshness: liquidityState.liquidityBufferFreshness,
    },
  });
}

async function computeFromChainConfig(body: z.infer<typeof SubmitRiskSchema>): Promise<ComputedRisk> {
  const snapshotContext = await captureRiskSnapshotContext();
  validateRiskSnapshotTime(body.occurredAt, snapshotContext, ENV.RISK_INPUT_MAX_AGE_SEC);
  const config = await readActiveWeightsConfig(snapshotContext);
  const [valuationState, holderState, pressureState, queueState, liquidityState, staleState] = await Promise.all([
    resolveValuationHaircut(body, snapshotContext),
    resolveHolderShares(snapshotContext),
    resolveRedemptionPressure(body, snapshotContext),
    resolveRedemptionQueueRatio(snapshotContext),
    resolveLiquidityBuffer(body, snapshotContext),
    resolveValuationTiming(body, snapshotContext),
  ]);
  const resolvedBody = {
    ...body,
    valuationHaircutBps: valuationState.valuationHaircutBps,
    holderSharesBps: holderState.holderSharesBps,
    redemptionPressureBps: pressureState.redemptionPressureBps,
    redemptionQueueRatioBps: queueState.redemptionQueueRatioBps,
    liquidityBufferRatioBps: liquidityState.liquidityBufferRatioBps,
    lastValuationAsOf: staleState.lastValuationAsOf,
    lastValuationStoredAt: staleState.lastValuationStoredAt,
  };
  const metrics = buildMetrics(resolvedBody, config);
  const payloadHash = payloadHashFor(
    resolvedBody,
    metrics,
    config,
    snapshotContext,
    valuationState,
    liquidityState,
  );
  return {
    snapshotContext,
    config,
    metrics,
    payloadHash,
    ...valuationState,
    ...holderState,
    ...pressureState,
    ...queueState,
    ...liquidityState,
    ...staleState,
  };
}

async function submitWithOneConfigRetry(body: z.infer<typeof SubmitRiskSchema>) {
  const c = riskRegistry as any;

  const { computed, tx, snapshot, retried } = await submitRiskWithOneConfigRetry<ComputedRisk, RiskSnapshot>({
    compute: () => computeFromChainConfig(body),
    submit: async (batch) => {
      const hash = await c.write.submitMetrics([
        fundId,
        batch.metrics,
        BigInt(batch.config.id),
        BigInt(body.occurredAt),
        batch.payloadHash,
      ]);
      await rpc.waitForTransactionReceipt({ hash });
      return hash;
    },
    confirm: async (batch) => {
      const latest = await readLatestSnapshot();
      if (!latest || latest.payloadHash !== batch.payloadHash || latest.weightsConfigId !== batch.config.id) {
        throw new Error('RISK_SNAPSHOT_CONFIRMATION_FAILED');
      }
      return latest;
    },
  });

  return { tx, snapshot, retried, ...computed };
}

async function readSnapshotAt(index: number): Promise<RiskSnapshot> {
  const c = riskRegistry as any;
  return normalizeSnapshot(await c.read.snapshotAt([fundId, BigInt(index)]));
}

async function readLatestSnapshot(): Promise<RiskSnapshot | null> {
  const c = riskRegistry as any;
  try {
    return normalizeSnapshot(await c.read.latestSnapshot([fundId]));
  } catch (error) {
    if (messageOf(error).includes('NO_RISK_SNAPSHOT')) {
      return null;
    }
    throw error;
  }
}

function resolveRegimeId(rawRegime: string | undefined): TransparencyRegimeId {
  return resolvePublicRegimeId(
    ENV.DEFAULT_TRANSPARENCY_REGIME,
    rawRegime as TransparencyRegimeId | undefined,
    ENV.ALLOW_REGIME_QUERY_OVERRIDE,
  );
}

async function findLatestDisclosedSnapshot(regime: TransparencyRegime, observedAt: number) {
  const c = riskRegistry as any;
  const length = Number(await c.read.historyLength([fundId]));
  return searchLatestDisclosedSnapshot(readSnapshotAt, length, regime, observedAt);
}

async function buildPublicRiskView(regimeId: TransparencyRegimeId, actor: string) {
  const regime = getTransparencyRegime(regimeId);
  const observedAt = nowSec();
  const c = riskRegistry as any;
  const { snapshot, disclosedAt, nextDisclosedAt } = await findLatestDisclosedSnapshot(regime, observedAt);

  if (!snapshot) {
    await recordAudit({
      actor,
      action: 'risk.public.observe',
      observedAt,
      details: {
        fundId,
        regime: regime.id,
        transparency: regime,
        available: false,
        notYetDisclosed: nextDisclosedAt !== null,
      },
    });
    return buildUnavailablePublicRiskPayload({
      regime,
      notYetDisclosed: nextDisclosedAt !== null,
      observedAt,
    });
  }

  const [transitions, currentGated] = await Promise.all([
    readControlTransitions(),
    c.read.isGated([fundId]).then(Boolean),
  ]);
  const usesDisclosureBoundary = regime.visibility === 'public';
  const latestVisibleControl = usesDisclosureBoundary
    ? latestDisclosedControlTransition(transitions, regime, observedAt)
    : latestControlTransition(transitions);
  const visibleGated = usesDisclosureBoundary
    ? disclosedControlState(transitions, regime, observedAt)
    : currentGated;

  await recordAudit({
    actor,
    action: 'risk.public.observe',
    occurredAt: snapshot.occurredAt,
    submittedAt: snapshot.submittedAt,
    disclosedAt: disclosedAt as number,
    observedAt,
    details: {
      fundId,
      regime: regime.id,
      transparency: regime,
      payloadHash: snapshot.payloadHash,
      available: true,
    },
  });

  return buildPublicRiskPayload({
    regime,
    snapshot,
    observedAt,
    disclosedAt: disclosedAt as number,
    visibleGated,
    latestVisibleControlEventName: latestVisibleControl?.eventName ?? null,
  });
}

async function buildRegulatorRiskView(regimeId: TransparencyRegimeId, actor: string) {
  const regime = getTransparencyRegime(regimeId);
  const observedAt = nowSec();
  const c = riskRegistry as any;

  if (regulatorUsesDisclosureBoundary(regime)) {
    const { snapshot, disclosedAt, nextDisclosedAt } = await findLatestDisclosedSnapshot(regime, observedAt);
    if (!snapshot) {
      await recordAudit({
        actor,
        action: 'risk.regulator.observe',
        observedAt,
        details: {
          fundId,
          regime: regime.id,
          transparency: regime,
          available: false,
          notYetDisclosed: nextDisclosedAt !== null,
        },
      });
      return buildUnavailableRegulatorRiskPayload({
        fundId,
        regime,
        observedAt,
        notYetDisclosed: nextDisclosedAt !== null,
      });
    }

    const transitions = await readControlTransitions();
    const visibleGated = disclosedControlState(transitions, regime, observedAt);
    await recordAudit({
      actor,
      action: 'risk.regulator.observe',
      occurredAt: snapshot.occurredAt,
      submittedAt: snapshot.submittedAt,
      disclosedAt: disclosedAt as number,
      observedAt,
      details: {
        fundId,
        regime: regime.id,
        transparency: regime,
        payloadHash: snapshot.payloadHash,
        available: true,
      },
    });

    return buildRegulatorRiskPayload({
      fundId,
      regime,
      snapshot,
      observedAt,
      disclosedAt: disclosedAt as number,
      visibleGated,
    });
  }

  const snapshot = await readLatestSnapshot();
  const gated = Boolean(await c.read.isGated([fundId]));

  if (!snapshot) {
    await recordAudit({
      actor,
      action: 'risk.regulator.observe',
      observedAt,
      details: {
        fundId,
        regime: regime.id,
        transparency: regime,
        available: false,
      },
    });
    return buildUnavailableRegulatorRiskPayload({
      fundId,
      regime,
      observedAt,
      notYetDisclosed: false,
    });
  }

  await recordAudit({
    actor,
    action: 'risk.regulator.observe',
    occurredAt: snapshot.occurredAt,
    submittedAt: snapshot.submittedAt,
    disclosedAt: snapshot.submittedAt,
    observedAt,
    details: {
      fundId,
      regime: regime.id,
      transparency: regime,
      payloadHash: snapshot.payloadHash,
      available: true,
    },
  });

  return buildRegulatorRiskPayload({
    fundId,
    regime,
    snapshot,
    observedAt,
    disclosedAt: snapshot.submittedAt,
    visibleGated: gated,
  });
}

async function sendPublicRiskView(req: FastifyRequest, reply: FastifyReply) {
  const parsedQuery = PublicRiskQuerySchema.safeParse(req.query);
  if (!parsedQuery.success) {
    return reply.code(400).send({
      error: 'INVALID_REGIME',
      allowedRegimes: TRANSPARENCY_REGIME_IDS,
    });
  }

  return reply.send(await buildPublicRiskView(
    resolveRegimeId(parsedQuery.data.regime),
    auditActorFor(req),
  ));
}

async function sendRegulatorRiskView(req: FastifyRequest, reply: FastifyReply) {
  const parsedQuery = PublicRiskQuerySchema.safeParse(req.query);
  if (!parsedQuery.success) {
    return reply.code(400).send({
      error: 'INVALID_REGIME',
      allowedRegimes: TRANSPARENCY_REGIME_IDS,
    });
  }

  return reply.send(await buildRegulatorRiskView(
    resolveRegimeId(parsedQuery.data.regime),
    auditActorFor(req),
  ));
}

export default async function (app: FastifyInstance) {
  app.post('/risk/submit', { preHandler: requireAnyRole(...ACCESS_POLICY.riskSubmit) }, async (req, reply) => {
    const body = SubmitRiskSchema.parse(req.body);
    const result = await submitWithOneConfigRetry(body);

    const defaultRegime = getTransparencyRegime(ENV.DEFAULT_TRANSPARENCY_REGIME);
    await recordAudit({
      actor: auditActorFor(req),
      action: 'risk.submit',
      occurredAt: result.snapshot.occurredAt,
      submittedAt: result.snapshot.submittedAt,
      disclosedAt: disclosureTimeFor(result.snapshot.submittedAt, defaultRegime),
      transactionHash: result.tx,
      details: {
        fundId,
        payloadSchemaVersion: RISK_PAYLOAD_SCHEMA_VERSION,
        chainId: result.snapshotContext.chainId,
        riskRegistryAddress: ENV.RISK_REGISTRY_ADDRESS,
        payloadHash: result.snapshot.payloadHash,
        snapshotBlockNumber: result.snapshotContext.blockNumber.toString(),
        snapshotBlockTimestamp: result.snapshotContext.blockTimestamp,
        riskScoreBps: result.snapshot.riskScoreBps,
        weightsConfigId: result.config.id,
        valuationHaircutSource: result.valuationHaircutSource,
        valuationHaircutSnapshot: result.valuationHaircutSnapshot,
        valuationHaircutFreshness: result.valuationHaircutFreshness,
        holderSource: result.holderSource,
        holderSnapshot: result.holderSnapshot,
        redemptionPressureSource: result.redemptionPressureSource,
        redemptionPressureSnapshot: result.redemptionPressureSnapshot,
        redemptionRequestPressureBps: result.metrics.redemptionPressureBps,
        redemptionRequestedAmount: result.redemptionPressureSnapshot.requestedAmount,
        redemptionSettledAmount: result.redemptionPressureSnapshot.settledAmount,
        redemptionQueueSource: result.redemptionQueueSource,
        liquidityBufferSource: result.liquidityBufferSource,
        liquidityBufferSnapshot: result.liquidityBufferSnapshot,
        liquidityBufferFreshness: result.liquidityBufferFreshness,
        stalePricingSource: result.stalePricingSource,
        lastValuationUpdateAt: result.lastValuationUpdateAt,
        lastValuationAsOf: result.lastValuationAsOf,
        lastValuationStoredAt: result.lastValuationStoredAt,
        staleAgeFromAsOfSec: result.staleAgeFromAsOfSec,
        staleAgeFromStoredAtSec: result.staleAgeFromStoredAtSec,
        staleReferenceUsed: result.staleReferenceUsed,
        retried: result.retried,
      },
    });

    return reply.send({
      tx: result.tx,
      fundId,
      payloadSchemaVersion: RISK_PAYLOAD_SCHEMA_VERSION,
      chainId: result.snapshotContext.chainId,
      riskRegistryAddress: ENV.RISK_REGISTRY_ADDRESS,
      snapshotBlockNumber: result.snapshotContext.blockNumber.toString(),
      snapshotBlockTimestamp: result.snapshotContext.blockTimestamp,
      metrics: result.metrics,
      redemptionRequestPressureBps: result.metrics.redemptionPressureBps,
      redemptionRequestedAmount: result.redemptionPressureSnapshot.requestedAmount,
      redemptionSettledAmount: result.redemptionPressureSnapshot.settledAmount,
      riskScoreBps: result.snapshot.riskScoreBps,
      weightsConfigId: result.config.id,
      weightsHash: result.config.weightsHash,
      maxStaleAgeSec: result.config.maxStaleAgeSec,
      valuationHaircutSource: result.valuationHaircutSource,
      valuationHaircutSnapshot: result.valuationHaircutSnapshot,
      valuationHaircutFreshness: result.valuationHaircutFreshness,
      holderSource: result.holderSource,
      redemptionPressureSource: result.redemptionPressureSource,
      redemptionPressureSnapshot: result.redemptionPressureSnapshot,
      redemptionQueueSource: result.redemptionQueueSource,
      liquidityBufferSource: result.liquidityBufferSource,
      liquidityBufferSnapshot: result.liquidityBufferSnapshot,
      liquidityBufferFreshness: result.liquidityBufferFreshness,
      stalePricingSource: result.stalePricingSource,
      lastValuationUpdateAt: result.lastValuationUpdateAt,
      lastValuationAsOf: result.lastValuationAsOf,
      lastValuationStoredAt: result.lastValuationStoredAt,
      staleAgeFromAsOfSec: result.staleAgeFromAsOfSec,
      staleAgeFromStoredAtSec: result.staleAgeFromStoredAtSec,
      staleReferenceUsed: result.staleReferenceUsed,
      holderSharesBps: result.holderSnapshot.holderSharesBps,
      holderSnapshot: result.holderSnapshot,
      payloadHash: result.payloadHash,
      retried: result.retried,
    });
  });

  app.post(
    '/risk/release-gate',
    { preHandler: requireAnyRole(...ACCESS_POLICY.gateRelease) },
    async (req, reply) => {
      const parsedBody = ReleaseGateSchema.safeParse(req.body);
      if (!parsedBody.success) {
        return reply.code(400).send({ error: 'INVALID_REASON_HASH' });
      }

      const c = regulatorRiskRegistry as any;
      if (!await c.read.isGated([fundId])) {
        return reply.code(409).send({ error: 'FUND_NOT_GATED', fundId });
      }

      const reasonHash = parsedBody.data.reasonHash as `0x${string}`;
      const tx = await c.write.releaseGate([fundId, reasonHash]);
      const submittedAt = await waitForTransactionTimestamp(tx);
      await recordAudit({
        actor: auditActorFor(req),
        action: 'risk.gate.release',
        occurredAt: submittedAt,
        submittedAt,
        disclosedAt: submittedAt,
        transactionHash: tx,
        details: { fundId, reasonHash },
      });

      return reply.send({
        tx,
        fundId,
        reasonHash,
        submittedAt,
        gated: false,
      });
    },
  );

  app.get(
    '/risk/regulator',
    { preHandler: requireAnyRole(...ACCESS_POLICY.regulatorRiskRead) },
    sendRegulatorRiskView,
  );

  app.get('/risk/public', sendPublicRiskView);

  app.get('/risk', sendPublicRiskView);

  app.get('/risk/audit', { preHandler: requireAnyRole(...ACCESS_POLICY.auditRead) }, async (req) => {
    const query = RiskAuditQuerySchema.parse(req.query);
    const entries = await listAuditEntries(query.limit);
    await recordAudit({
      actor: auditActorFor(req),
      action: 'audit.api.read',
      details: { count: entries.length, limit: query.limit },
    });
    return { count: entries.length, limit: query.limit, entries };
  });
}
