import { FastifyInstance } from 'fastify';
import { getAddress, isAddress, zeroHash } from 'viem';
import { z } from 'zod';
import { recordAudit } from '../audit/log';
import { waitForTransactionTimestamp } from '../audit/chain-time';
import { ACCESS_POLICY, auditActorFor, requireAnyRole } from '../auth';
import { token } from '../chain';
import { db } from '../db/client';
import { ENV } from '../env';

const EligibilitySchema = z.object({
  address: z.string().refine(isAddress, 'Invalid address'),
  vcHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/, 'Invalid vcHash').optional(),
});

export default async function (app: FastifyInstance) {
  app.post('/kyc/mark-eligible', { preHandler: requireAnyRole(...ACCESS_POLICY.kycWrite) }, async (req) => {
    const body = EligibilitySchema.parse(req.body);
    const investor = getAddress(body.address) as `0x${string}`;
    const vcHash = (body.vcHash ?? zeroHash) as `0x${string}`;

    const c = token as any;
    const tx = await c.write.setWhitelisted([investor, true, vcHash]);
    const submittedAt = await waitForTransactionTimestamp(tx);

    if (ENV.DATABASE_URL) {
      await db.query(
        'insert into investors(address, eligible, vc_hash) values($1, true, $2) on conflict (address) do update set eligible=true, vc_hash=excluded.vc_hash',
        [investor, vcHash],
      );
    }

    await recordAudit({
      actor: auditActorFor(req),
      action: 'eligibility.mark',
      occurredAt: submittedAt,
      submittedAt,
      transactionHash: tx,
      details: { investor, eligible: true, vcHash },
    });
    return { ok: true, address: investor, vcHash, tx };
  });

  app.get('/kyc/:address', { preHandler: requireAnyRole(...ACCESS_POLICY.kycRead) }, async (req) => {
    const { address } = z.object({ address: z.string().refine(isAddress, 'Invalid address') }).parse(req.params);
    const investor = getAddress(address);
    if (!ENV.DATABASE_URL) {
      const result = { address: investor, eligible: false, vc_hash: null };
      await recordAudit({
        actor: auditActorFor(req),
        action: 'eligibility.read',
        details: { investor, found: false },
      });
      return result;
    }

    const { rows } = await db.query('select eligible, vc_hash from investors where address=$1', [investor]);
    const result = rows[0] ?? { address: investor, eligible: false, vc_hash: null };
    await recordAudit({
      actor: auditActorFor(req),
      action: 'eligibility.read',
      details: { investor, found: rows.length > 0 },
    });
    return result;
  });
}
