import { parseAbiItem } from 'viem';
import { computeRedemptionPressureBps } from './calc';

type Address = `0x${string}`;

export type RedemptionPressureSnapshot = {
  redemptionPressureBps: number;
  windowStartAt: number;
  windowEndAt: number;
  requestedAmount: string;
  settledAmount: string;
  totalSupply: string;
};

export type RedemptionRequestFlow = {
  fundId: `0x${string}`;
  redeemedShares: bigint;
  requestedAt: number;
};

export type RedemptionSettlementFlow = {
  fundId: `0x${string}`;
  redeemedShares: bigint;
  settledAt: number;
};

const redemptionRequestedEvent = parseAbiItem(
  'event RedemptionRequested(bytes32 indexed fundId, address indexed investor, uint256 indexed requestId, uint256 redeemedShares, uint64 requestedAt)',
);

const redemptionSettledEvent = parseAbiItem(
  'event RedemptionSettled(bytes32 indexed fundId, address indexed investor, uint256 indexed requestId, uint256 redeemedShares, uint256 redemptionAmount, uint256 settlementNav, uint64 settlementNavAsOf, uint64 requestedAt, uint64 settledAt)',
);

function inWindow(timestamp: number, startAt: number, endAt: number): boolean {
  return timestamp >= startAt && timestamp <= endAt;
}

function sameBytes32(a: `0x${string}`, b: `0x${string}`): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

export function computeRedemptionPressureSnapshotFromEvents(args: {
  fundId: `0x${string}`;
  occurredAt: number;
  windowSec: number;
  totalSupply: bigint;
  requests: RedemptionRequestFlow[];
  settlements: RedemptionSettlementFlow[];
}): RedemptionPressureSnapshot {
  if (!Number.isInteger(args.occurredAt) || args.occurredAt <= 0) {
    throw new Error('INVALID_OCCURRED_AT');
  }
  if (!Number.isInteger(args.windowSec) || args.windowSec <= 0) {
    throw new Error('INVALID_REDEMPTION_PRESSURE_WINDOW');
  }

  const windowStartAt = Math.max(0, args.occurredAt - args.windowSec);
  const requestedAmount = args.requests
    .filter((request) => sameBytes32(request.fundId, args.fundId))
    .filter((request) => inWindow(request.requestedAt, windowStartAt, args.occurredAt))
    .reduce((sum, request) => sum + request.redeemedShares, 0n);
  const settledAmount = args.settlements
    .filter((settlement) => sameBytes32(settlement.fundId, args.fundId))
    .filter((settlement) => inWindow(settlement.settledAt, windowStartAt, args.occurredAt))
    .reduce((sum, settlement) => sum + settlement.redeemedShares, 0n);

  return {
    redemptionPressureBps: computeRedemptionPressureBps(requestedAmount, args.totalSupply),
    windowStartAt,
    windowEndAt: args.occurredAt,
    requestedAmount: requestedAmount.toString(),
    settledAmount: settledAmount.toString(),
    totalSupply: args.totalSupply.toString(),
  };
}

export async function readRedemptionPressureSnapshot(
  occurredAt: number,
  windowSec: number,
  blockNumber: bigint,
): Promise<RedemptionPressureSnapshot> {
  const [{ ENV }, { fundId, rpc, token }] = await Promise.all([
    import('../env'),
    import('../chain'),
  ]);
  const [requestLogs, settledLogs, totalSupplyRaw] = await Promise.all([
    rpc.getLogs({
      address: ENV.FUND_TOKEN_ADDRESS as Address,
      event: redemptionRequestedEvent,
      fromBlock: 0n,
      toBlock: blockNumber,
    }),
    rpc.getLogs({
      address: ENV.FUND_TOKEN_ADDRESS as Address,
      event: redemptionSettledEvent,
      fromBlock: 0n,
      toBlock: blockNumber,
    }),
    (token as any).read.totalSupply({ blockNumber }),
  ]);

  return computeRedemptionPressureSnapshotFromEvents({
    fundId,
    occurredAt,
    windowSec,
    totalSupply: totalSupplyRaw as bigint,
    requests: requestLogs.map((log) => ({
      fundId: log.args.fundId as `0x${string}`,
      redeemedShares: log.args.redeemedShares as bigint,
      requestedAt: Number(log.args.requestedAt),
    })),
    settlements: settledLogs.map((log) => ({
      fundId: log.args.fundId as `0x${string}`,
      redeemedShares: log.args.redeemedShares as bigint,
      settledAt: Number(log.args.settledAt),
    })),
  });
}
