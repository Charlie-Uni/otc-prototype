import { FastifyInstance } from 'fastify';
import { encodeAbiParameters, keccak256 } from 'viem';
import { z } from 'zod';
import { waitForTransactionTimestamp } from '../audit/chain-time';
import { recordAudit } from '../audit/log';
import { ACCESS_POLICY, auditActorFor, requireAnyRole } from '../auth';
import { fundId, liquidityRiskRegistry } from '../chain';

const LiquidityBufferSchema = z.object({
  liquidityBufferRatioBps: z.coerce.number().int().safe().min(0),
  occurredAt: z.coerce.number().int().positive(),
});

export default async function (app: FastifyInstance) {
  app.post(
    '/liquidity/update',
    { preHandler: requireAnyRole(...ACCESS_POLICY.liquidityWrite) },
    async (req, reply) => {
      const body = LiquidityBufferSchema.parse(req.body);
      const payloadHash = keccak256(encodeAbiParameters(
        [
          { name: 'fundId', type: 'bytes32' },
          { name: 'liquidityBufferRatioBps', type: 'uint256' },
          { name: 'occurredAt', type: 'uint64' },
        ],
        [fundId, BigInt(body.liquidityBufferRatioBps), BigInt(body.occurredAt)],
      ));
      const tx = await liquidityRiskRegistry.write.submitLiquidityBuffer([
        fundId,
        BigInt(body.liquidityBufferRatioBps),
        BigInt(body.occurredAt),
        payloadHash,
      ]);
      const submittedAt = await waitForTransactionTimestamp(tx);
      await recordAudit({
        actor: auditActorFor(req),
        action: 'liquidity.buffer.update',
        occurredAt: body.occurredAt,
        submittedAt,
        transactionHash: tx,
        details: {
          fundId,
          liquidityBufferRatioBps: body.liquidityBufferRatioBps,
          payloadHash,
        },
      });
      return reply.send({
        tx,
        fundId,
        liquidityBufferRatioBps: body.liquidityBufferRatioBps,
        occurredAt: body.occurredAt,
        submittedAt,
        payloadHash,
      });
    },
  );

  app.get(
    '/liquidity/latest',
    { preHandler: requireAnyRole(...ACCESS_POLICY.liquidityRead) },
    async (req, reply) => {
      const raw = await liquidityRiskRegistry.read.latestLiquidityBuffer([fundId]);
      const result = {
        fundId,
        liquidityBufferRatioBps: Number(raw[0]),
        occurredAt: Number(raw[1]),
        submittedAt: Number(raw[2]),
        payloadHash: raw[3],
        submittedBy: raw[4],
      };
      await recordAudit({
        actor: auditActorFor(req),
        action: 'liquidity.buffer.read',
        occurredAt: result.occurredAt,
        submittedAt: result.submittedAt,
        disclosedAt: result.submittedAt,
        details: result,
      });
      return reply.send(result);
    },
  );
}
