import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { waitForTransactionTimestamp } from '../audit/chain-time';
import { recordAudit } from '../audit/log';
import { ACCESS_POLICY, auditActorFor, requireAnyRole } from '../auth';
import { nav } from '../chain';

export default async function (app: FastifyInstance) {
  app.get('/nav/latest', { preHandler: requireAnyRole(...ACCESS_POLICY.navRead) }, async (req, reply) => {
    const c = nav as any;
    const [navBn, asOfBn, storedAtBn] = await c.read.latestNAV(); // <-- destructure
    const result = {
      nav: navBn.toString(),
      asOf: asOfBn.toString(),
      storedAt: storedAtBn.toString(),
    };
    await recordAudit({
      actor: auditActorFor(req),
      action: 'nav.latest.read',
      occurredAt: Number(asOfBn),
      submittedAt: Number(storedAtBn),
      disclosedAt: Number(storedAtBn),
      details: { nav: result.nav },
    });
    return reply.send(result);
  });

  app.post('/nav/post', { preHandler: requireAnyRole(...ACCESS_POLICY.navWrite) }, async (req, reply) => {
    const body = z.object({
      nav: z.string().regex(/^\d+$/).refine((value) => BigInt(value) > 0n, 'NAV must be positive'),
      asOf: z.coerce.number().int().positive(),
    }).parse(req.body);
    const c = nav as any;
    const txHash = await c.write.postNAV([BigInt(body.nav), BigInt(body.asOf)]);
    const submittedAt = await waitForTransactionTimestamp(txHash);
    await recordAudit({
      actor: auditActorFor(req),
      action: 'nav.post',
      occurredAt: body.asOf,
      submittedAt,
      transactionHash: txHash,
      details: { nav: body.nav, asOf: body.asOf },
    });
    return reply.send({ tx: txHash });
  });
}
