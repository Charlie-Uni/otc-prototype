import { FastifyInstance } from 'fastify';
import { encodeAbiParameters, keccak256 } from 'viem';
import { z } from 'zod';
import { waitForTransactionTimestamp } from '../audit/chain-time';
import { recordAudit } from '../audit/log';
import { ACCESS_POLICY, auditActorFor, requireAnyRole } from '../auth';
import { fundId, nav } from '../chain';

export default async function (app: FastifyInstance) {
  app.get('/nav/latest', { preHandler: requireAnyRole(...ACCESS_POLICY.navRead) }, async (req, reply) => {
    const c = nav as any;
    const raw = await c.read.latestNAV([fundId]);
    const navBn = raw.nav ?? raw[0];
    const asOfBn = raw.asOf ?? raw[1];
    const storedAtBn = raw.storedAt ?? raw[2];
    const adjustmentBn = raw.navAdjustmentBps ?? raw[3];
    const payloadHash = raw.payloadHash ?? raw[4];
    const result = {
      nav: navBn.toString(),
      asOf: asOfBn.toString(),
      storedAt: storedAtBn.toString(),
      navAdjustmentBps: adjustmentBn.toString(),
      payloadHash,
      fundId,
    };
    await recordAudit({
      actor: auditActorFor(req),
      action: 'nav.latest.read',
      occurredAt: Number(asOfBn),
      submittedAt: Number(storedAtBn),
      disclosedAt: Number(storedAtBn),
      details: result,
    });
    return reply.send(result);
  });

  app.post('/nav/post', { preHandler: requireAnyRole(...ACCESS_POLICY.navWrite) }, async (req, reply) => {
    const body = z.object({
      nav: z.string().regex(/^\d+$/).refine((value) => BigInt(value) > 0n, 'NAV must be positive'),
      asOf: z.coerce.number().int().positive(),
    }).parse(req.body);
    const payloadHash = keccak256(encodeAbiParameters(
      [
        { name: 'fundId', type: 'bytes32' },
        { name: 'nav', type: 'uint256' },
        { name: 'asOf', type: 'uint64' },
      ],
      [fundId, BigInt(body.nav), BigInt(body.asOf)],
    ));
    const c = nav as any;
    const txHash = await c.write.postNAV([fundId, BigInt(body.nav), BigInt(body.asOf), payloadHash]);
    const submittedAt = await waitForTransactionTimestamp(txHash);
    const raw = await c.read.latestNAV([fundId]);
    const navAdjustmentBps = (raw.navAdjustmentBps ?? raw[3]).toString();
    await recordAudit({
      actor: auditActorFor(req),
      action: 'nav.post',
      occurredAt: body.asOf,
      submittedAt,
      transactionHash: txHash,
      details: { fundId, nav: body.nav, asOf: body.asOf, navAdjustmentBps, payloadHash },
    });
    return reply.send({ tx: txHash, fundId, navAdjustmentBps, payloadHash });
  });

  app.post(
    '/nav/valuation-haircut',
    { preHandler: requireAnyRole(...ACCESS_POLICY.navWrite) },
    async (req, reply) => {
      const body = z.object({
        valuationHaircutBps: z.coerce.number().int().min(0).max(10_000),
        occurredAt: z.coerce.number().int().positive(),
      }).parse(req.body);
      const payloadHash = keccak256(encodeAbiParameters(
        [
          { name: 'fundId', type: 'bytes32' },
          { name: 'valuationHaircutBps', type: 'uint16' },
          { name: 'occurredAt', type: 'uint64' },
        ],
        [fundId, body.valuationHaircutBps, BigInt(body.occurredAt)],
      ));
      const c = nav as any;
      const tx = await c.write.postValuationHaircut([
        fundId,
        body.valuationHaircutBps,
        BigInt(body.occurredAt),
        payloadHash,
      ]);
      const submittedAt = await waitForTransactionTimestamp(tx);
      await recordAudit({
        actor: auditActorFor(req),
        action: 'valuation.haircut.update',
        occurredAt: body.occurredAt,
        submittedAt,
        transactionHash: tx,
        details: { fundId, valuationHaircutBps: body.valuationHaircutBps, payloadHash },
      });
      return reply.send({ tx, fundId, submittedAt, payloadHash, ...body });
    },
  );
}
