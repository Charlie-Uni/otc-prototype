import { FastifyInstance } from 'fastify';
import { decodeEventLog, isAddress, parseAbi } from 'viem';
import { z } from 'zod';
import { waitForTransaction, waitForTransactionTimestamp } from '../audit/chain-time';
import { recordAudit } from '../audit/log';
import { ACCESS_POLICY, auditActorFor, requireAnyRole } from '../auth';
import { token } from '../chain';

const AddressSchema = z.string().refine(isAddress, 'Invalid address');
const AmountSchema = z.coerce.bigint().positive();
const SubscriptionRequestIdSchema = z.coerce.bigint().min(0n);
const NonZeroBytes32Schema = z.string()
    .regex(/^0x[0-9a-fA-F]{64}$/, 'Invalid bytes32')
    .refine((value) => !/^0x0{64}$/i.test(value), 'Expected non-zero bytes32');
const RequestEventsAbi = parseAbi([
    'event SubscriptionRequested(bytes32 indexed fundId, address indexed investor, uint256 indexed requestId, uint256 amount, uint64 requestedAt, bytes32 requestHash)',
    'event RedemptionRequested(bytes32 indexed fundId, address indexed investor, uint256 indexed requestId, uint256 amount, uint64 requestedAt)',
]);

function requestIdFromReceipt(
    receipt: { logs: readonly any[] },
    eventName: 'SubscriptionRequested' | 'RedemptionRequested',
): bigint {
    for (const log of receipt.logs) {
        try {
            const decoded = decodeEventLog({
                abi: RequestEventsAbi,
                data: log.data,
                topics: log.topics,
                strict: true,
            });
            if (decoded.eventName !== eventName) continue;
            const requestId = (decoded.args as any).requestId;
            if (requestId !== undefined) return BigInt(requestId);
        } catch {
            continue;
        }
    }
    throw new Error(`${eventName.toUpperCase()}_EVENT_NOT_FOUND`);
}

export default async function (app: FastifyInstance) {
    app.post('/token/request-subscription', { preHandler: requireAnyRole(...ACCESS_POLICY.subscriptionWrite) }, async (req) => {
        const body = z.object({ to: AddressSchema, amount: AmountSchema }).parse(req.body);
        const c = token as any;
        const tx = await c.write.requestSubscriptionFor([body.to as `0x${string}`, body.amount]);
        const { receipt, submittedAt } = await waitForTransaction(tx);
        const requestId = requestIdFromReceipt(receipt, 'SubscriptionRequested');
        await recordAudit({
            actor: auditActorFor(req),
            action: 'subscription.request',
            occurredAt: submittedAt,
            submittedAt,
            transactionHash: tx,
            details: { requestId: requestId.toString(), investor: body.to, amount: body.amount.toString() },
        });
        return { tx, requestId: requestId.toString(), status: 'pending' };
    });

    app.post('/token/accept-subscription', { preHandler: requireAnyRole(...ACCESS_POLICY.subscriptionWrite) }, async (req) => {
        const body = z.object({ requestId: SubscriptionRequestIdSchema }).parse(req.body);
        const c = token as any;
        const raw = await c.read.subscriptionRequestAt([body.requestId]);
        const request = raw.request ?? raw;
        const tx = await c.write.acceptSubscription([body.requestId]);
        const submittedAt = await waitForTransactionTimestamp(tx);
        await recordAudit({
            actor: auditActorFor(req),
            action: 'subscription.accept',
            occurredAt: submittedAt,
            submittedAt,
            transactionHash: tx,
            details: {
                requestId: body.requestId.toString(),
                investor: request.investor ?? request[0],
                amount: (request.amount ?? request[1]).toString(),
                requestHash: request.requestHash ?? request[4],
            },
        });
        return { tx, requestId: body.requestId.toString(), status: 'accepted' };
    });

    app.get('/token/subscription-request/:id', { preHandler: requireAnyRole(...ACCESS_POLICY.subscriptionRead) }, async (req) => {
        const { id } = z.object({ id: SubscriptionRequestIdSchema }).parse(req.params);
        const c = token as any;
        const raw = await c.read.subscriptionRequestAt([id]);
        const request = raw.request ?? raw;
        const result = {
            investor: request.investor ?? request[0],
            amount: (request.amount ?? request[1]).toString(),
            requestedAt: Number(request.requestedAt ?? request[2]),
            acceptedAt: Number(request.acceptedAt ?? request[3]),
            requestHash: request.requestHash ?? request[4],
            status: Boolean(request.accepted ?? request[5]) ? 'accepted' : 'pending',
        };
        await recordAudit({
            actor: auditActorFor(req),
            action: 'subscription.request.read',
            occurredAt: result.requestedAt,
            submittedAt: result.requestedAt,
            disclosedAt: result.requestedAt,
            details: { requestId: id.toString(), ...result },
        });
        return result;
    });

    app.post('/token/redeem', { preHandler: requireAnyRole(...ACCESS_POLICY.redemptionWrite) }, async (req) => {
        const body = z.object({ from: AddressSchema, amount: AmountSchema }).parse(req.body);
        const c = token as any;
        const tx = await c.write.requestRedemptionFor([body.from as `0x${string}`, body.amount]);
        const { receipt, submittedAt } = await waitForTransaction(tx);
        const requestId = requestIdFromReceipt(receipt, 'RedemptionRequested');
        await recordAudit({
            actor: auditActorFor(req),
            action: 'redemption.request',
            occurredAt: submittedAt,
            submittedAt,
            transactionHash: tx,
            details: { requestId: requestId.toString(), investor: body.from, amount: body.amount.toString() },
        });
        return { tx, requestId: requestId.toString(), status: 'queued' };
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
        return { tx, requestId: body.requestId.toString(), status: 'settled' };
    });

    app.post('/token/flag-settlement-delayed', { preHandler: requireAnyRole(...ACCESS_POLICY.redemptionWrite) }, async (req) => {
        const body = z.object({
            requestId: z.coerce.bigint().min(0n),
            reasonHash: NonZeroBytes32Schema,
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
        return {
            tx,
            requestId: body.requestId.toString(),
            reasonHash: body.reasonHash,
            status: 'delayed',
        };
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
            delayedAt: Number(request.delayedAt ?? request[4]),
            delayReasonHash: request.delayReasonHash ?? request[5],
            settled: Boolean(request.settled ?? request[6]),
            delayed: Boolean(request.delayed ?? request[7]),
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
