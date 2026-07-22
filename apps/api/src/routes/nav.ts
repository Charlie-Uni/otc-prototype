import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ACCESS_POLICY, requireAnyRole } from '../auth';
import { nav, rpc } from '../chain';

export default async function (app: FastifyInstance) {
  app.get('/nav/latest', { preHandler: requireAnyRole(...ACCESS_POLICY.navRead) }, async (_req, reply) => {
    const c = nav as any;
    const [navBn, asOfBn, storedAtBn] = await c.read.latestNAV(); // <-- destructure
    return reply.send({
      nav: navBn.toString(),
      asOf: asOfBn.toString(),
      storedAt: storedAtBn.toString(),
    });
  });

  app.post('/nav/post', { preHandler: requireAnyRole(...ACCESS_POLICY.navWrite) }, async (req, reply) => {
    const body = z.object({ nav: z.string(), asOf: z.number() }).parse(req.body);
    const c = nav as any;
    const txHash = await c.write.postNAV([BigInt(body.nav), BigInt(body.asOf)]);
    await rpc.waitForTransactionReceipt({ hash: txHash });
    return reply.send({ tx: txHash });
  });
}
