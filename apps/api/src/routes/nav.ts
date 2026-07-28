import { FastifyInstance } from 'fastify';
import { encodeAbiParameters, keccak256 } from 'viem';
import { z } from 'zod';
import { waitForTransactionTimestamp } from '../audit/chain-time';
import { recordAudit } from '../audit/log';
import { ACCESS_POLICY, auditActorFor, requireAnyRole } from '../auth';
import { fundId, nav, rpc, token } from '../chain';
import { ENV } from '../env';

const PositiveUintString = z.string()
  .regex(/^\d+$/)
  .refine((value) => BigInt(value) > 0n, 'Expected a positive integer');
const AsOfSchema = z.coerce.number().int().positive();
const NAV_PAYLOAD_SCHEMA_VERSION = 2;

function normalizeNavRecord(raw: any) {
  return {
    nav: (raw.nav ?? raw[0]).toString(),
    netAssetValue: (raw.netAssetValue ?? raw[1]).toString(),
    totalSharesSnapshot: (raw.totalSharesSnapshot ?? raw[2]).toString(),
    asOf: Number(raw.asOf ?? raw[3]),
    storedAt: Number(raw.storedAt ?? raw[4]),
    navAdjustmentBps: (raw.navAdjustmentBps ?? raw[5]).toString(),
    payloadHash: (raw.payloadHash ?? raw[6]) as `0x${string}`,
    isInitial: Boolean(raw.isInitial ?? raw[7]),
  };
}

export default async function (app: FastifyInstance) {
  app.get('/nav/latest', { preHandler: requireAnyRole(...ACCESS_POLICY.navRead) }, async (req, reply) => {
    const c = nav as any;
    const result = {
      ...normalizeNavRecord(await c.read.latestNAV([fundId])),
      fundId,
    };
    await recordAudit({
      actor: auditActorFor(req),
      action: 'nav.latest.read',
      occurredAt: result.asOf,
      submittedAt: result.storedAt,
      disclosedAt: result.storedAt,
      details: result,
    });
    return reply.send(result);
  });

  app.post('/nav/initial', { preHandler: requireAnyRole(...ACCESS_POLICY.navWrite) }, async (req, reply) => {
    const body = z.object({
      initialNav: PositiveUintString,
      asOf: AsOfSchema,
    }).strict().parse(req.body);
    const chainId = await rpc.getChainId();
    const payloadHash = keccak256(encodeAbiParameters(
      [
        { name: 'payloadSchemaVersion', type: 'uint16' },
        { name: 'chainId', type: 'uint256' },
        { name: 'navRegistry', type: 'address' },
        { name: 'fundId', type: 'bytes32' },
        { name: 'initialNav', type: 'uint256' },
        { name: 'asOf', type: 'uint64' },
      ],
      [
        NAV_PAYLOAD_SCHEMA_VERSION,
        BigInt(chainId),
        ENV.NAV_REGISTRY_ADDRESS,
        fundId,
        BigInt(body.initialNav),
        BigInt(body.asOf),
      ],
    ));
    const c = nav as any;
    const tx = await c.write.postInitialNAV([fundId, BigInt(body.initialNav), BigInt(body.asOf), payloadHash]);
    const submittedAt = await waitForTransactionTimestamp(tx);
    const record = normalizeNavRecord(await c.read.latestNAV([fundId]));
    await recordAudit({
      actor: auditActorFor(req),
      action: 'nav.initial.post',
      occurredAt: body.asOf,
      submittedAt,
      transactionHash: tx,
      details: { fundId, ...record },
    });
    return reply.send({ tx, fundId, ...record });
  });

  app.post('/nav/post', { preHandler: requireAnyRole(...ACCESS_POLICY.navWrite) }, async (req, reply) => {
    const body = z.object({
      netAssetValue: PositiveUintString,
      asOf: AsOfSchema,
    }).strict().parse(req.body);
    const [block, chainId] = await Promise.all([
      rpc.getBlock({ blockTag: 'latest' }),
      rpc.getChainId(),
    ]);
    if (block.number === null) throw new Error('SNAPSHOT_BLOCK_NUMBER_UNAVAILABLE');
    const tokenContract = token as any;
    const totalSharesSnapshot = BigInt(await tokenContract.read.totalSupply({ blockNumber: block.number }));
    if (totalSharesSnapshot === 0n) {
      throw Object.assign(new Error('NO_OUTSTANDING_SHARES'), { statusCode: 409 });
    }

    const payloadHash = keccak256(encodeAbiParameters(
      [
        { name: 'payloadSchemaVersion', type: 'uint16' },
        { name: 'chainId', type: 'uint256' },
        { name: 'navRegistry', type: 'address' },
        { name: 'fundToken', type: 'address' },
        { name: 'fundId', type: 'bytes32' },
        { name: 'snapshotBlockNumber', type: 'uint256' },
        { name: 'netAssetValue', type: 'uint256' },
        { name: 'totalSharesSnapshot', type: 'uint256' },
        { name: 'asOf', type: 'uint64' },
      ],
      [
        NAV_PAYLOAD_SCHEMA_VERSION,
        BigInt(chainId),
        ENV.NAV_REGISTRY_ADDRESS,
        ENV.FUND_TOKEN_ADDRESS,
        fundId,
        block.number,
        BigInt(body.netAssetValue),
        totalSharesSnapshot,
        BigInt(body.asOf),
      ],
    ));
    const c = nav as any;
    const tx = await c.write.postNAV([
      fundId,
      BigInt(body.netAssetValue),
      totalSharesSnapshot,
      BigInt(body.asOf),
      payloadHash,
    ]);
    const submittedAt = await waitForTransactionTimestamp(tx);
    const record = normalizeNavRecord(await c.read.latestNAV([fundId]));
    await recordAudit({
      actor: auditActorFor(req),
      action: 'nav.post',
      occurredAt: body.asOf,
      submittedAt,
      transactionHash: tx,
      details: {
        fundId,
        snapshotBlockNumber: block.number.toString(),
        ...record,
      },
    });
    return reply.send({
      tx,
      fundId,
      snapshotBlockNumber: block.number.toString(),
      ...record,
    });
  });

  app.post(
    '/nav/valuation-haircut',
    { preHandler: requireAnyRole(...ACCESS_POLICY.navWrite) },
    async (req, reply) => {
      const body = z.object({
        valuationHaircutBps: z.coerce.number().int().min(0).max(10_000),
        occurredAt: z.coerce.number().int().positive(),
      }).strict().parse(req.body);
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
