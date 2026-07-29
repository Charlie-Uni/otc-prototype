import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { ACCESS_POLICY, auditActorFor, requireAnyRole } from '../auth';
import { waitForTransactionTimestamp } from '../audit/chain-time';
import { listAuditEntries, recordAudit } from '../audit/log';
import { fundId, regulatorRiskRegistry } from '../chain';
import { ENV } from '../env';
import { RISK_PAYLOAD_SCHEMA_VERSION } from '../risk/payload-commitment';
import {
  TRANSPARENCY_REGIME_IDS,
  disclosureTimeFor,
  getTransparencyRegime,
  resolvePublicRegimeId,
  type TransparencyRegimeId,
} from '../risk/regimes';
import { submitRisk } from '../risk/submission';
import { buildPublicRiskView, buildRegulatorRiskView } from '../risk/views';

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

function resolveRegimeId(rawRegime: string | undefined): TransparencyRegimeId {
  return resolvePublicRegimeId(
    ENV.DEFAULT_TRANSPARENCY_REGIME,
    rawRegime as TransparencyRegimeId | undefined,
    ENV.ALLOW_REGIME_QUERY_OVERRIDE,
  );
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

export default async function registerRiskRoutes(app: FastifyInstance) {
  app.post(
    '/risk/submit',
    { preHandler: requireAnyRole(...ACCESS_POLICY.riskSubmit) },
    async (req, reply) => {
      const input = SubmitRiskSchema.parse(req.body);
      const result = await submitRisk(input);
      const defaultRegime = getTransparencyRegime(ENV.DEFAULT_TRANSPARENCY_REGIME);
      const sourceEvidence = {
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
      };

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
          ...sourceEvidence,
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
        riskScoreBps: result.snapshot.riskScoreBps,
        weightsConfigId: result.config.id,
        weightsHash: result.config.weightsHash,
        maxStaleAgeSec: result.config.maxStaleAgeSec,
        ...sourceEvidence,
        holderSharesBps: result.holderSnapshot.holderSharesBps,
        payloadHash: result.payloadHash,
        retried: result.retried,
      });
    },
  );

  app.post(
    '/risk/release-gate',
    { preHandler: requireAnyRole(...ACCESS_POLICY.gateRelease) },
    async (req, reply) => {
      const parsedBody = ReleaseGateSchema.safeParse(req.body);
      if (!parsedBody.success) {
        return reply.code(400).send({ error: 'INVALID_REASON_HASH' });
      }
      if (!await regulatorRiskRegistry.read.isGated([fundId])) {
        return reply.code(409).send({ error: 'FUND_NOT_GATED', fundId });
      }

      const reasonHash = parsedBody.data.reasonHash as `0x${string}`;
      const tx = await regulatorRiskRegistry.write.releaseGate([fundId, reasonHash]);
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
  app.get(
    '/risk/audit',
    { preHandler: requireAnyRole(...ACCESS_POLICY.auditRead) },
    async (req) => {
      const query = RiskAuditQuerySchema.parse(req.query);
      const entries = await listAuditEntries(query.limit);
      await recordAudit({
        actor: auditActorFor(req),
        action: 'audit.api.read',
        details: { count: entries.length, limit: query.limit },
      });
      return { count: entries.length, limit: query.limit, entries };
    },
  );
}
