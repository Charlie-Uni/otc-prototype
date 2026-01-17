import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '../db/client';


export default async function (app: FastifyInstance) {
    app.post('/kyc/mark-eligible', async (req, res) => {
    const body = z.object({ address: z.string(), vcHash: z.string().optional() }).parse(req.body);
    await db.query('insert into investors(address, eligible, vc_hash) values($1, true, $2) on conflict (address) do update set eligible=true, vc_hash=excluded.vc_hash',
        [body.address, body.vcHash ?? null]);
    return { ok: true };
    });


    app.get('/kyc/:address', async (req) => {
        // @ts-ignore
        const { address } = req.params;
        const { rows } = await db.query('select eligible, vc_hash from investors where address=$1', [address]);
        return rows[0] ?? { eligible: false };
    });
}