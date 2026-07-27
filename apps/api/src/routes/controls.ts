import { FastifyInstance } from 'fastify';
import { encodeAbiParameters, keccak256 } from 'viem';
import { z } from 'zod';
import { waitForTransactionTimestamp } from '../audit/chain-time';
import { recordAudit } from '../audit/log';
import { ACCESS_POLICY, auditActorFor, requireAnyRole } from '../auth';
import { controlRiskRegistry, fundId } from '../chain';
import { MAX_BPS } from '../risk/calc';

const bytes32Schema = z.string()
  .regex(/^0x[0-9a-fA-F]{64}$/, 'Expected bytes32')
  .refine((value) => !/^0x0{64}$/i.test(value), 'Expected non-zero bytes32');
const controlBaseSchema = z.object({
  ruleId: bytes32Schema,
  occurredAt: z.coerce.number().int().positive(),
});

export default async function (app: FastifyInstance) {
  app.post(
    '/controls/swing-pricing',
    { preHandler: requireAnyRole(...ACCESS_POLICY.extendedControlWrite) },
    async (req, reply) => {
      const body = controlBaseSchema.extend({
        adjustmentBps: z.coerce.number().int().positive().max(MAX_BPS),
      }).parse(req.body);
      const payloadHash = keccak256(encodeAbiParameters(
        [
          { name: 'fundId', type: 'bytes32' },
          { name: 'adjustmentBps', type: 'uint16' },
          { name: 'ruleId', type: 'bytes32' },
          { name: 'occurredAt', type: 'uint64' },
        ],
        [fundId, body.adjustmentBps, body.ruleId as `0x${string}`, BigInt(body.occurredAt)],
      ));
      const c = controlRiskRegistry as any;
      const tx = await c.write.applySwingPricing([
        fundId,
        body.adjustmentBps,
        body.ruleId,
        BigInt(body.occurredAt),
        payloadHash,
      ]);
      const submittedAt = await waitForTransactionTimestamp(tx);
      await recordAudit({
        actor: auditActorFor(req),
        action: 'control.swing_pricing.apply',
        occurredAt: body.occurredAt,
        submittedAt,
        transactionHash: tx,
        details: { fundId, adjustmentBps: body.adjustmentBps, ruleId: body.ruleId, payloadHash },
      });
      return reply.send({ tx, fundId, submittedAt, payloadHash, ...body });
    },
  );

  app.post(
    '/controls/side-pocket',
    { preHandler: requireAnyRole(...ACCESS_POLICY.extendedControlWrite) },
    async (req, reply) => {
      const body = controlBaseSchema.extend({
        assetCommitmentHash: bytes32Schema,
      }).parse(req.body);
      const payloadHash = keccak256(encodeAbiParameters(
        [
          { name: 'fundId', type: 'bytes32' },
          { name: 'assetCommitmentHash', type: 'bytes32' },
          { name: 'ruleId', type: 'bytes32' },
          { name: 'occurredAt', type: 'uint64' },
        ],
        [
          fundId,
          body.assetCommitmentHash as `0x${string}`,
          body.ruleId as `0x${string}`,
          BigInt(body.occurredAt),
        ],
      ));
      const c = controlRiskRegistry as any;
      const tx = await c.write.createSidePocket([
        fundId,
        body.assetCommitmentHash,
        body.ruleId,
        BigInt(body.occurredAt),
        payloadHash,
      ]);
      const submittedAt = await waitForTransactionTimestamp(tx);
      await recordAudit({
        actor: auditActorFor(req),
        action: 'control.side_pocket.create',
        occurredAt: body.occurredAt,
        submittedAt,
        transactionHash: tx,
        details: {
          fundId,
          assetCommitmentHash: body.assetCommitmentHash,
          ruleId: body.ruleId,
          payloadHash,
        },
      });
      return reply.send({ tx, fundId, submittedAt, payloadHash, ...body });
    },
  );

  app.get(
    '/controls/state',
    { preHandler: requireAnyRole(...ACCESS_POLICY.regulatorRiskRead) },
    async (req, reply) => {
      const c = controlRiskRegistry as any;
      const raw = await c.read.extendedControlState([fundId]);
      const result = {
        fundId,
        swingPricingActive: Boolean(raw.swingPricingActive ?? raw[0]),
        sidePocketActive: Boolean(raw.sidePocketActive ?? raw[1]),
        swingPricingAdjustmentBps: Number(raw.swingPricingAdjustmentBps ?? raw[2]),
        lastRiskScoreBps: Number(raw.lastRiskScoreBps ?? raw[3]),
        lastRuleId: raw.lastRuleId ?? raw[4],
        sidePocketAssetCommitmentHash: raw.sidePocketAssetCommitmentHash ?? raw[5],
      };
      await recordAudit({
        actor: auditActorFor(req),
        action: 'control.extended_state.read',
        details: result,
      });
      return reply.send(result);
    },
  );
}
