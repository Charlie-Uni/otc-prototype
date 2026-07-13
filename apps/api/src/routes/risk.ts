import { FastifyInstance } from 'fastify';
import { encodeAbiParameters, keccak256 } from 'viem';
import { z } from 'zod';
import { getAuditEntries, recordAudit } from '../audit/log';
import { fundId, riskRegistry, rpc } from '../chain';
import { ENV } from '../env';
import {
  MAX_BPS,
  RiskMetrics,
  computeInvestorConcentrationBps,
  computeLiquidityShortfallBps,
  normalizeStalePricingRiskBps,
  riskLevelFor,
} from '../risk/calc';
import { HolderShareSnapshot, readHolderShareSnapshot } from '../risk/holdings';

const bpsSchema = z.coerce.number().int().min(0).max(MAX_BPS);
const nonNegativeIntegerSchema = z.coerce.number().int().min(0);

const SubmitRiskSchema = z.object({
  occurredAt: z.coerce.number().int().positive(),
  valuationHaircutBps: bpsSchema,
  redemptionPressureBps: bpsSchema,
  redemptionQueueRatioBps: bpsSchema,
  liquidityBufferRatioBps: nonNegativeIntegerSchema,
  lastValuationUpdateAt: z.coerce.number().int().positive(),
  holderSharesBps: z.array(bpsSchema).min(1).optional(),
}).superRefine((body, ctx) => {
  if (body.lastValuationUpdateAt > body.occurredAt) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['lastValuationUpdateAt'],
      message: 'lastValuationUpdateAt must be <= occurredAt',
    });
  }

  const holderShareSum = body.holderSharesBps?.reduce((sum, share) => sum + share, 0);
  if (holderShareSum !== undefined && holderShareSum !== MAX_BPS) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['holderSharesBps'],
      message: 'holderSharesBps must sum to 10000',
    });
  }
});

type WeightsConfig = {
  id: number;
  maxStaleAgeSec: number;
  weightsHash: `0x${string}`;
};

type ResolvedRiskInput = z.infer<typeof SubmitRiskSchema> & {
  holderSharesBps: number[];
};

type ComputedRisk = {
  config: WeightsConfig;
  metrics: RiskMetrics;
  payloadHash: `0x${string}`;
  holderSource: 'request' | 'chain';
  holderSnapshot?: HolderShareSnapshot;
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

async function readActiveWeightsConfig(): Promise<WeightsConfig> {
  const c = riskRegistry as any;
  const activeId = Number(await c.read.activeWeightsConfigId());
  const [, maxStaleAgeRaw, weightsHash, exists] = await c.read.getWeightsConfig([BigInt(activeId)]);
  if (!exists) {
    throw new Error('ACTIVE_WEIGHTS_NOT_FOUND');
  }

  return {
    id: activeId,
    maxStaleAgeSec: Number(maxStaleAgeRaw),
    weightsHash,
  };
}

async function resolveHolderShares(body: z.infer<typeof SubmitRiskSchema>) {
  if (body.holderSharesBps) {
    return {
      holderSharesBps: body.holderSharesBps,
      holderSource: 'request' as const,
      holderSnapshot: undefined,
    };
  }

  const holderSnapshot = await readHolderShareSnapshot();
  return {
    holderSharesBps: holderSnapshot.holderSharesBps,
    holderSource: 'chain' as const,
    holderSnapshot,
  };
}

function buildMetrics(body: ResolvedRiskInput, config: WeightsConfig): RiskMetrics {
  const staleAgeSec = body.occurredAt - body.lastValuationUpdateAt;
  return {
    valuationHaircutBps: body.valuationHaircutBps,
    redemptionPressureBps: body.redemptionPressureBps,
    redemptionQueueRatioBps: body.redemptionQueueRatioBps,
    liquidityShortfallBps: computeLiquidityShortfallBps(body.liquidityBufferRatioBps),
    stalePricingRiskBps: normalizeStalePricingRiskBps(staleAgeSec, config.maxStaleAgeSec),
    investorConcentrationBps: computeInvestorConcentrationBps(body.holderSharesBps),
  };
}

function payloadHashFor(body: ResolvedRiskInput, metrics: RiskMetrics, config: WeightsConfig) {
  return keccak256(encodeAbiParameters(
    [
      { name: 'occurredAt', type: 'uint64' },
      { name: 'valuationHaircutBps', type: 'uint16' },
      { name: 'redemptionPressureBps', type: 'uint16' },
      { name: 'redemptionQueueRatioBps', type: 'uint16' },
      { name: 'liquidityBufferRatioBps', type: 'uint256' },
      { name: 'lastValuationUpdateAt', type: 'uint64' },
      { name: 'holderSharesBps', type: 'uint16[]' },
      { name: 'valuationHaircutMetricBps', type: 'uint16' },
      { name: 'redemptionPressureMetricBps', type: 'uint16' },
      { name: 'redemptionQueueRatioMetricBps', type: 'uint16' },
      { name: 'liquidityShortfallMetricBps', type: 'uint16' },
      { name: 'stalePricingRiskMetricBps', type: 'uint16' },
      { name: 'investorConcentrationMetricBps', type: 'uint16' },
      { name: 'weightsConfigId', type: 'uint64' },
      { name: 'maxStaleAgeSec', type: 'uint64' },
      { name: 'weightsHash', type: 'bytes32' },
    ],
    [
      BigInt(body.occurredAt),
      body.valuationHaircutBps,
      body.redemptionPressureBps,
      body.redemptionQueueRatioBps,
      BigInt(body.liquidityBufferRatioBps),
      BigInt(body.lastValuationUpdateAt),
      body.holderSharesBps,
      metrics.valuationHaircutBps,
      metrics.redemptionPressureBps,
      metrics.redemptionQueueRatioBps,
      metrics.liquidityShortfallBps,
      metrics.stalePricingRiskBps,
      metrics.investorConcentrationBps,
      BigInt(config.id),
      BigInt(config.maxStaleAgeSec),
      config.weightsHash,
    ],
  ));
}

async function computeFromChainConfig(body: z.infer<typeof SubmitRiskSchema>): Promise<ComputedRisk> {
  const config = await readActiveWeightsConfig();
  const holderState = await resolveHolderShares(body);
  const resolvedBody = { ...body, holderSharesBps: holderState.holderSharesBps };
  const metrics = buildMetrics(resolvedBody, config);
  const payloadHash = payloadHashFor(resolvedBody, metrics, config);
  return { config, metrics, payloadHash, ...holderState };
}

async function submitWithOneConfigRetry(body: z.infer<typeof SubmitRiskSchema>) {
  const c = riskRegistry as any;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const computed = await computeFromChainConfig(body);
    try {
      const tx = await c.write.submitMetrics([
        fundId,
        computed.metrics,
        BigInt(computed.config.id),
        BigInt(body.occurredAt),
        computed.payloadHash,
      ]);
      await rpc.waitForTransactionReceipt({ hash: tx });
      const snapshot = await readLatestSnapshot();
      if (!snapshot || snapshot.payloadHash !== computed.payloadHash || snapshot.weightsConfigId !== computed.config.id) {
        throw new Error('RISK_SNAPSHOT_CONFIRMATION_FAILED');
      }

      return { tx, snapshot, retried: attempt > 0, ...computed };
    } catch (error) {
      if (attempt === 0 && messageOf(error).includes('INACTIVE_WEIGHTS')) {
        continue;
      }
      throw error;
    }
  }

  throw new Error('RISK_SUBMIT_RETRY_EXHAUSTED');
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

async function findLatestDisclosedSnapshot(delaySec: number, observedAt: number) {
  const c = riskRegistry as any;
  const length = Number(await c.read.historyLength([fundId]));
  if (length === 0) {
    return { snapshot: null, nextDisclosedAt: null };
  }

  let nextDisclosedAt: number | null = null;
  for (let index = length - 1; index >= 0; index -= 1) {
    const snapshot = await readSnapshotAt(index);
    const disclosedAt = snapshot.submittedAt + delaySec;
    if (observedAt >= disclosedAt) {
      return { snapshot, nextDisclosedAt };
    }
    nextDisclosedAt = disclosedAt;
  }

  return { snapshot: null, nextDisclosedAt };
}

async function buildPublicRiskView() {
  const delaySec = ENV.PUBLIC_DISCLOSURE_DELAY_SEC;
  const observedAt = nowSec();
  const c = riskRegistry as any;
  const { snapshot, nextDisclosedAt } = await findLatestDisclosedSnapshot(delaySec, observedAt);

  recordAudit('risk.public.observe', {
    fundId,
    observedAt,
    delaySec,
    available: snapshot !== null,
    notYetDisclosed: snapshot === null && nextDisclosedAt !== null,
  });

  if (!snapshot) {
    return {
      available: false,
      notYetDisclosed: nextDisclosedAt !== null,
      observedAt,
      delaySec,
      status: 'green' as const,
      riskLevel: 'green' as const,
      gated: false,
    };
  }

  const disclosedAt = snapshot.submittedAt + delaySec;
  const latestSnapshot = await readLatestSnapshot();
  const latestControlIsDisclosed = latestSnapshot
    ? observedAt >= latestSnapshot.submittedAt + delaySec
    : true;
  const currentGated = Boolean(await c.read.isGated([fundId]));
  const publicGated = latestControlIsDisclosed
    ? currentGated
    : snapshot.riskScoreBps > snapshot.kappaBps;
  const riskLevel = riskLevelFor(snapshot.riskScoreBps, publicGated);

  return {
    available: true,
    riskLevel,
    status: riskLevel,
    gated: publicGated,
    disclosedAt,
    observedAt,
    delaySec,
  };
}

export default async function (app: FastifyInstance) {
  app.post('/risk/submit', async (req, reply) => {
    const body = SubmitRiskSchema.parse(req.body);
    const result = await submitWithOneConfigRetry(body);

    recordAudit('risk.submit', {
      fundId,
      riskScoreBps: result.snapshot.riskScoreBps,
      weightsConfigId: result.config.id,
      holderSource: result.holderSource,
      holderSnapshot: result.holderSnapshot,
      retried: result.retried,
      tx: result.tx,
    });

    return reply.send({
      tx: result.tx,
      fundId,
      metrics: result.metrics,
      riskScoreBps: result.snapshot.riskScoreBps,
      weightsConfigId: result.config.id,
      weightsHash: result.config.weightsHash,
      maxStaleAgeSec: result.config.maxStaleAgeSec,
      holderSource: result.holderSource,
      holderSharesBps: result.holderSnapshot?.holderSharesBps ?? body.holderSharesBps,
      holderSnapshot: result.holderSnapshot,
      payloadHash: result.payloadHash,
      retried: result.retried,
    });
  });

  app.get('/risk/regulator', async (_req, reply) => {
    const observedAt = nowSec();
    const snapshot = await readLatestSnapshot();
    const c = riskRegistry as any;
    const gated = Boolean(await c.read.isGated([fundId]));
    const kappaBps = Number(await c.read.effectiveKappaBps([fundId]));

    recordAudit('risk.regulator.observe', { fundId, observedAt, available: snapshot !== null });

    return reply.send({
      fundId,
      observedAt,
      available: snapshot !== null,
      gated,
      kappaBps,
      snapshot,
    });
  });

  app.get('/risk/public', async (_req, reply) => {
    return reply.send(await buildPublicRiskView());
  });

  app.get('/risk', async (_req, reply) => {
    return reply.send(await buildPublicRiskView());
  });

  app.get('/risk/audit', async () => ({ entries: getAuditEntries() }));
}
