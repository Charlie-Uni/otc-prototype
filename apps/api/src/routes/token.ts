import { FastifyInstance } from 'fastify';
import { isAddress } from 'viem';
import { z } from 'zod';
import { ACCESS_POLICY, requireAnyRole } from '../auth';
import { rpc, token } from '../chain';

const AddressSchema = z.string().refine(isAddress, 'Invalid address');
const AmountSchema = z.coerce.bigint().positive();

export default async function (app: FastifyInstance) {
    app.post('/token/subscribe', { preHandler: requireAnyRole(...ACCESS_POLICY.subscriptionWrite) }, async (req) => {
        const body = z.object({ to: AddressSchema, amount: AmountSchema }).parse(req.body);
        const c = token as any;
        const tx = await c.write.mint([body.to as `0x${string}`, body.amount]);
        await rpc.waitForTransactionReceipt({ hash: tx });
        return { tx };
    });


    app.post('/token/redeem', { preHandler: requireAnyRole(...ACCESS_POLICY.redemptionWrite) }, async (req) => {
        const body = z.object({ from: AddressSchema, amount: AmountSchema }).parse(req.body);
        const c = token as any;
        const tx = await c.write.requestRedemptionFor([body.from as `0x${string}`, body.amount]);
        await rpc.waitForTransactionReceipt({ hash: tx });
        return { tx, status: 'queued' };
    });

    app.post('/token/settle-redemption', { preHandler: requireAnyRole(...ACCESS_POLICY.redemptionWrite) }, async (req) => {
        const body = z.object({ requestId: z.coerce.bigint().min(0n) }).parse(req.body);
        const c = token as any;
        const tx = await c.write.settleRedemption([body.requestId]);
        await rpc.waitForTransactionReceipt({ hash: tx });
        return { tx };
    });

    app.post('/token/flag-settlement-delayed', { preHandler: requireAnyRole(...ACCESS_POLICY.redemptionWrite) }, async (req) => {
        const body = z.object({
            requestId: z.coerce.bigint().min(0n),
            reasonHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/, 'Invalid reasonHash'),
        }).parse(req.body);
        const c = token as any;
        const tx = await c.write.flagSettlementDelayed([body.requestId, body.reasonHash as `0x${string}`]);
        await rpc.waitForTransactionReceipt({ hash: tx });
        return { tx };
    });

    app.get('/token/redemption-queue', { preHandler: requireAnyRole(...ACCESS_POLICY.redemptionRead) }, async () => {
        const c = token as any;
        const [totalQueuedRedemption, redemptionQueueRatioBps] = await Promise.all([
            c.read.totalQueuedRedemption(),
            c.read.redemptionQueueRatioBps(),
        ]);
        return {
            totalQueuedRedemption: totalQueuedRedemption.toString(),
            redemptionQueueRatioBps: Number(redemptionQueueRatioBps),
        };
    });

    app.get('/token/redemption-request/:id', { preHandler: requireAnyRole(...ACCESS_POLICY.redemptionRead) }, async (req) => {
        const { id } = z.object({ id: z.coerce.bigint().min(0n) }).parse(req.params);
        const c = token as any;
        const raw = await c.read.redemptionRequestAt([id]);
        const request = raw.request ?? raw;
        return {
            investor: request.investor ?? request[0],
            amount: (request.amount ?? request[1]).toString(),
            requestedAt: Number(request.requestedAt ?? request[2]),
            settledAt: Number(request.settledAt ?? request[3]),
            settled: Boolean(request.settled ?? request[4]),
        };
    });


    app.get('/token/balance/:addr', { preHandler: requireAnyRole(...ACCESS_POLICY.holderBalanceRead) }, async (req) => {
        const { addr } = z.object({ addr: AddressSchema }).parse(req.params);
        const c = token as any;
        const bal = await c.read.balanceOf([addr as `0x${string}`]);
        return { balance: bal.toString() };
    });
}
