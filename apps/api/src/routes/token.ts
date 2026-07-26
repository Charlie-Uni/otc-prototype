import { FastifyInstance } from 'fastify';
import { isAddress } from 'viem';
import { z } from 'zod';
import { waitForTransactionTimestamp } from '../audit/chain-time';
import { recordAudit } from '../audit/log';
import { ACCESS_POLICY, auditActorFor, requireAnyRole } from '../auth';
import { token } from '../chain';

const AddressSchema = z.string().refine(isAddress, 'Invalid address');
const AmountSchema = z.coerce.bigint().positive();

export default async function (app: FastifyInstance) {
    app.post('/token/subscribe', { preHandler: requireAnyRole(...ACCESS_POLICY.subscriptionWrite) }, async (req) => {
        const body = z.object({ to: AddressSchema, amount: AmountSchema }).parse(req.body);
        const c = token as any;
        const tx = await c.write.mint([body.to as `0x${string}`, body.amount]);
        const submittedAt = await waitForTransactionTimestamp(tx);
        await recordAudit({
            actor: auditActorFor(req),
            action: 'subscription.accept',
            occurredAt: submittedAt,
            submittedAt,
            transactionHash: tx,
            details: { investor: body.to, amount: body.amount.toString() },
        });
        return { tx };
    });


    app.post('/token/redeem', { preHandler: requireAnyRole(...ACCESS_POLICY.redemptionWrite) }, async (req) => {
        const body = z.object({ from: AddressSchema, amount: AmountSchema }).parse(req.body);
        const c = token as any;
        const tx = await c.write.requestRedemptionFor([body.from as `0x${string}`, body.amount]);
        const submittedAt = await waitForTransactionTimestamp(tx);
        await recordAudit({
            actor: auditActorFor(req),
            action: 'redemption.request',
            occurredAt: submittedAt,
            submittedAt,
            transactionHash: tx,
            details: { investor: body.from, amount: body.amount.toString() },
        });
        return { tx, status: 'queued' };
    });

    app.post('/token/settle-redemption', { preHandler: requireAnyRole(...ACCESS_POLICY.redemptionWrite) }, async (req) => {
        const body = z.object({ requestId: z.coerce.bigint().min(0n) }).parse(req.body);
        const c = token as any;
        const tx = await c.write.settleRedemption([body.requestId]);
        const submittedAt = await waitForTransactionTimestamp(tx);
        await recordAudit({
            actor: auditActorFor(req),
            action: 'redemption.settle',
            occurredAt: submittedAt,
            submittedAt,
            transactionHash: tx,
            details: { requestId: body.requestId.toString() },
        });
        return { tx };
    });

    app.post('/token/flag-settlement-delayed', { preHandler: requireAnyRole(...ACCESS_POLICY.redemptionWrite) }, async (req) => {
        const body = z.object({
            requestId: z.coerce.bigint().min(0n),
            reasonHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/, 'Invalid reasonHash'),
        }).parse(req.body);
        const c = token as any;
        const tx = await c.write.flagSettlementDelayed([body.requestId, body.reasonHash as `0x${string}`]);
        const submittedAt = await waitForTransactionTimestamp(tx);
        await recordAudit({
            actor: auditActorFor(req),
            action: 'redemption.delay.flag',
            occurredAt: submittedAt,
            submittedAt,
            transactionHash: tx,
            details: { requestId: body.requestId.toString(), reasonHash: body.reasonHash },
        });
        return { tx };
    });

    app.get('/token/redemption-queue', { preHandler: requireAnyRole(...ACCESS_POLICY.redemptionRead) }, async (req) => {
        const c = token as any;
        const [totalQueuedRedemption, redemptionQueueRatioBps] = await Promise.all([
            c.read.totalQueuedRedemption(),
            c.read.redemptionQueueRatioBps(),
        ]);
        const result = {
            totalQueuedRedemption: totalQueuedRedemption.toString(),
            redemptionQueueRatioBps: Number(redemptionQueueRatioBps),
        };
        await recordAudit({
            actor: auditActorFor(req),
            action: 'redemption.queue.read',
            details: result,
        });
        return result;
    });

    app.get('/token/redemption-request/:id', { preHandler: requireAnyRole(...ACCESS_POLICY.redemptionRead) }, async (req) => {
        const { id } = z.object({ id: z.coerce.bigint().min(0n) }).parse(req.params);
        const c = token as any;
        const raw = await c.read.redemptionRequestAt([id]);
        const request = raw.request ?? raw;
        const result = {
            investor: request.investor ?? request[0],
            amount: (request.amount ?? request[1]).toString(),
            requestedAt: Number(request.requestedAt ?? request[2]),
            settledAt: Number(request.settledAt ?? request[3]),
            settled: Boolean(request.settled ?? request[4]),
        };
        await recordAudit({
            actor: auditActorFor(req),
            action: 'redemption.request.read',
            occurredAt: result.requestedAt,
            submittedAt: result.requestedAt,
            disclosedAt: result.requestedAt,
            details: { requestId: id.toString(), ...result },
        });
        return result;
    });


    app.get('/token/balance/:addr', { preHandler: requireAnyRole(...ACCESS_POLICY.holderBalanceRead) }, async (req) => {
        const { addr } = z.object({ addr: AddressSchema }).parse(req.params);
        const c = token as any;
        const bal = await c.read.balanceOf([addr as `0x${string}`]);
        const result = { balance: bal.toString() };
        await recordAudit({
            actor: auditActorFor(req),
            action: 'share.balance.read',
            details: { investor: addr, ...result },
        });
        return result;
    });
}
