import { FastifyInstance } from 'fastify';
import { decodeEventLog, isAddress, parseAbi, type TransactionReceipt } from 'viem';
import { z } from 'zod';
import { waitForTransaction, waitForTransactionTimestamp } from '../audit/chain-time';
import { recordAudit } from '../audit/log';
import { ACCESS_POLICY, auditActorFor, requireAnyRole } from '../auth';
import { canReadHolderAddress } from '../auth/resource-auth';
import { token } from '../chain';
import { ENV } from '../env';

const AddressSchema = z.string().refine(isAddress, 'Invalid address');
const AmountSchema = z.coerce.bigint().positive();
const SubscriptionRequestIdSchema = z.coerce.bigint().min(0n);
const NonZeroBytes32Schema = z.string()
    .regex(/^0x[0-9a-fA-F]{64}$/, 'Invalid bytes32')
    .refine((value) => !/^0x0{64}$/i.test(value), 'Expected non-zero bytes32');
const RequestEventsAbi = parseAbi([
    'event SubscriptionRequested(bytes32 indexed fundId, address indexed investor, uint256 indexed requestId, uint256 subscriptionAmount, uint64 requestedAt, bytes32 requestHash)',
    'event RedemptionRequested(bytes32 indexed fundId, address indexed investor, uint256 indexed requestId, uint256 redeemedShares, uint64 requestedAt)',
]);

function requestIdFromReceipt(
    receipt: Pick<TransactionReceipt, 'logs'>,
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
            const requestId = decoded.args.requestId;
            if (requestId !== undefined) return BigInt(requestId);
        } catch {
            continue;
        }
    }
    throw new Error(`${eventName.toUpperCase()}_EVENT_NOT_FOUND`);
}

export default async function (app: FastifyInstance) {
    app.post('/token/request-subscription', { preHandler: requireAnyRole(...ACCESS_POLICY.subscriptionWrite) }, async (req) => {
        const body = z.object({ to: AddressSchema, subscriptionAmount: AmountSchema }).strict().parse(req.body);
        const tx = await token.write.requestSubscriptionFor([body.to as `0x${string}`, body.subscriptionAmount]);
        const { receipt, submittedAt } = await waitForTransaction(tx);
        const requestId = requestIdFromReceipt(receipt, 'SubscriptionRequested');
        await recordAudit({
            actor: auditActorFor(req),
            action: 'subscription.request',
            occurredAt: submittedAt,
            submittedAt,
            transactionHash: tx,
            details: {
                requestId: requestId.toString(),
                investor: body.to,
                subscriptionAmount: body.subscriptionAmount.toString(),
            },
        });
        return { tx, requestId: requestId.toString(), status: 'pending' };
    });

    app.post('/token/accept-subscription', { preHandler: requireAnyRole(...ACCESS_POLICY.subscriptionWrite) }, async (req) => {
        const body = z.object({ requestId: SubscriptionRequestIdSchema }).parse(req.body);
        const tx = await token.write.acceptSubscription([body.requestId]);
        const submittedAt = await waitForTransactionTimestamp(tx);
        const request = await token.read.subscriptionRequestAt([body.requestId]);
        const result = {
            requestId: body.requestId.toString(),
            investor: request[0],
            subscriptionAmount: request[1].toString(),
            mintedShares: request[2].toString(),
            navUsed: request[3].toString(),
            navAsOf: Number(request[4]),
            requestHash: request[7],
        };
        await recordAudit({
            actor: auditActorFor(req),
            action: 'subscription.accept',
            occurredAt: submittedAt,
            submittedAt,
            transactionHash: tx,
            details: result,
        });
        return { tx, ...result, status: 'accepted' };
    });

    app.get('/token/subscription-request/:id', { preHandler: requireAnyRole(...ACCESS_POLICY.subscriptionRead) }, async (req) => {
        const { id } = z.object({ id: SubscriptionRequestIdSchema }).parse(req.params);
        const request = await token.read.subscriptionRequestAt([id]);
        const result = {
            investor: request[0],
            subscriptionAmount: request[1].toString(),
            mintedShares: request[2].toString(),
            navUsed: request[3].toString(),
            navAsOf: Number(request[4]),
            requestedAt: Number(request[5]),
            acceptedAt: Number(request[6]),
            requestHash: request[7],
            status: request[8] ? 'accepted' : 'pending',
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
        const body = z.object({ from: AddressSchema, redeemedShares: AmountSchema }).strict().parse(req.body);
        const tx = await token.write.requestRedemptionFor([body.from as `0x${string}`, body.redeemedShares]);
        const { receipt, submittedAt } = await waitForTransaction(tx);
        const requestId = requestIdFromReceipt(receipt, 'RedemptionRequested');
        await recordAudit({
            actor: auditActorFor(req),
            action: 'redemption.request',
            occurredAt: submittedAt,
            submittedAt,
            transactionHash: tx,
            details: {
                requestId: requestId.toString(),
                investor: body.from,
                redeemedShares: body.redeemedShares.toString(),
            },
        });
        return { tx, requestId: requestId.toString(), status: 'queued' };
    });

    app.post('/token/settle-redemption', { preHandler: requireAnyRole(...ACCESS_POLICY.redemptionWrite) }, async (req) => {
        const body = z.object({ requestId: z.coerce.bigint().min(0n) }).parse(req.body);
        const tx = await token.write.settleRedemption([body.requestId]);
        const submittedAt = await waitForTransactionTimestamp(tx);
        const request = await token.read.redemptionRequestAt([body.requestId]);
        const settlement = {
            redeemedShares: request.redeemedShares.toString(),
            redemptionAmount: request.redemptionAmount.toString(),
            settlementNav: request.settlementNav.toString(),
            settlementNavAsOf: Number(request.settlementNavAsOf),
        };
        await recordAudit({
            actor: auditActorFor(req),
            action: 'redemption.settle',
            occurredAt: submittedAt,
            submittedAt,
            transactionHash: tx,
            details: { requestId: body.requestId.toString(), ...settlement },
        });
        return { tx, requestId: body.requestId.toString(), ...settlement, status: 'settled' };
    });

    app.post('/token/flag-settlement-delayed', { preHandler: requireAnyRole(...ACCESS_POLICY.redemptionWrite) }, async (req) => {
        const body = z.object({
            requestId: z.coerce.bigint().min(0n),
            reasonHash: NonZeroBytes32Schema,
        }).parse(req.body);
        const tx = await token.write.flagSettlementDelayed([body.requestId, body.reasonHash as `0x${string}`]);
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
        const [totalQueuedRedemption, redemptionQueueRatioBps] = await Promise.all([
            token.read.totalQueuedRedemption(),
            token.read.redemptionQueueRatioBps(),
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
        const request = await token.read.redemptionRequestAt([id]);
        const result = {
            investor: request.investor,
            redeemedShares: request.redeemedShares.toString(),
            redemptionAmount: request.redemptionAmount.toString(),
            settlementNav: request.settlementNav.toString(),
            settlementNavAsOf: Number(request.settlementNavAsOf),
            requestedAt: Number(request.requestedAt),
            settledAt: Number(request.settledAt),
            delayedAt: Number(request.delayedAt),
            delayReasonHash: request.delayReasonHash,
            settled: request.settled,
            delayed: request.delayed,
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


    app.get('/token/balance/:addr', { preHandler: requireAnyRole(...ACCESS_POLICY.holderBalanceRead) }, async (req, reply) => {
        const { addr } = z.object({ addr: AddressSchema }).parse(req.params);
        if (!canReadHolderAddress(req.apiRole, addr, ENV.API_KEY_INVESTOR_ADDRESS)) {
            return reply.code(403).send({ error: 'HOLDER_ADDRESS_FORBIDDEN' });
        }
        const bal = await token.read.balanceOf([addr as `0x${string}`]);
        const result = { balance: bal.toString() };
        await recordAudit({
            actor: auditActorFor(req),
            action: 'share.balance.read',
            details: { investor: addr, ...result },
        });
        return result;
    });
}
