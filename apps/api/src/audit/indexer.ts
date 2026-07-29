import { decodeEventLog } from 'viem';
import { fundId, rpc } from '../chain';
import { db } from '../db/client';
import { ENV } from '../env';
import { lifecycleLogCommitmentHash } from './commitment';
import {
  FUND_TOKEN_EVENT_ABI,
  LifecycleContractName,
  LifecycleEvent,
  NAV_REGISTRY_EVENT_ABI,
  RISK_REGISTRY_EVENT_ABI,
  normalizeLifecycleEvent,
  sortLifecycleEvents,
} from './lifecycle';

const memoryLifecycleEvents = new Map<string, LifecycleEvent>();

const EVENT_SOURCES = [
  {
    contractName: 'FundToken' as const,
    address: ENV.FUND_TOKEN_ADDRESS as `0x${string}`,
    abi: FUND_TOKEN_EVENT_ABI,
  },
  {
    contractName: 'NAVRegistry' as const,
    address: ENV.NAV_REGISTRY_ADDRESS as `0x${string}`,
    abi: NAV_REGISTRY_EVENT_ABI,
  },
  {
    contractName: 'RiskRegistry' as const,
    address: ENV.RISK_REGISTRY_ADDRESS as `0x${string}`,
    abi: RISK_REGISTRY_EVENT_ABI,
  },
];

type Source = {
  contractName: LifecycleContractName;
  address: `0x${string}`;
  abi: typeof FUND_TOKEN_EVENT_ABI | typeof NAV_REGISTRY_EVENT_ABI | typeof RISK_REGISTRY_EVENT_ABI;
};

async function readSourceEvents(source: Source, chainId: number) {
  const logs = await rpc.getLogs({
    address: source.address,
    fromBlock: 0n,
    toBlock: 'latest',
  });
  const blockTimestampCache = new Map<bigint, number>();
  const events: LifecycleEvent[] = [];
  let skipped = 0;

  for (const log of logs) {
    if (log.blockNumber === null || log.transactionHash === null || log.logIndex === null) continue;

    let decoded: ReturnType<typeof decodeEventLog>;
    try {
      decoded = decodeEventLog({
        abi: source.abi,
        data: log.data,
        topics: log.topics,
        strict: true,
      });
    } catch {
      skipped += 1;
      continue;
    }

    let blockTimestamp = blockTimestampCache.get(log.blockNumber);
    if (blockTimestamp === undefined) {
      const block = await rpc.getBlock({ blockNumber: log.blockNumber });
      blockTimestamp = Number(block.timestamp);
      blockTimestampCache.set(log.blockNumber, blockTimestamp);
    }

    events.push(normalizeLifecycleEvent({
      chainId,
      contractAddress: source.address,
      contractName: source.contractName,
      eventName: decoded.eventName,
      transactionHash: log.transactionHash,
      logIndex: log.logIndex,
      blockNumber: Number(log.blockNumber),
      blockTimestamp,
      commitmentHash: lifecycleLogCommitmentHash(log.topics, log.data),
      defaultFundId: fundId,
      args: (decoded.args ?? {}) as Record<string, unknown>,
    }));
  }

  return { events, skipped };
}

async function persistLifecycleEvent(event: LifecycleEvent): Promise<boolean> {
  if (!ENV.DATABASE_URL) {
    const inserted = !memoryLifecycleEvents.has(event.eventId);
    memoryLifecycleEvents.set(event.eventId, event);
    return inserted;
  }

  const result = await db.query(
    `insert into lifecycle_event(
       event_id, chain_id, contract_address, contract_name, event_name, category, fund_id,
       transaction_hash, log_index, block_number, occurred_at, submitted_at, commitment_hash, payload
     ) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
     on conflict (chain_id, transaction_hash, log_index) do nothing`,
    [
      event.eventId,
      event.chainId,
      event.contractAddress,
      event.contractName,
      event.eventName,
      event.category,
      event.fundId,
      event.transactionHash,
      event.logIndex,
      event.blockNumber,
      event.occurredAt,
      event.submittedAt,
      event.commitmentHash,
      JSON.stringify(event.payload),
    ],
  );
  memoryLifecycleEvents.set(event.eventId, event);
  return (result.rowCount ?? 0) > 0;
}

export async function syncLifecycleEvents() {
  const chainId = await rpc.getChainId();
  const sourceResults = await Promise.all(EVENT_SOURCES.map((source) => readSourceEvents(source, chainId)));
  const events = sortLifecycleEvents(sourceResults.flatMap((result) => result.events));
  const skipped = sourceResults.reduce((total, result) => total + result.skipped, 0);
  let inserted = 0;
  for (const event of events) {
    if (await persistLifecycleEvent(event)) inserted += 1;
  }

  return {
    chainId,
    scanned: events.length,
    skipped,
    inserted,
    existing: events.length - inserted,
  };
}

function rowToLifecycleEvent(row: any): LifecycleEvent {
  return {
    eventId: row.event_id,
    chainId: Number(row.chain_id),
    contractAddress: row.contract_address,
    contractName: row.contract_name,
    eventName: row.event_name,
    category: row.category,
    fundId: row.fund_id,
    transactionHash: row.transaction_hash,
    logIndex: Number(row.log_index),
    blockNumber: Number(row.block_number),
    occurredAt: Number(row.occurred_at),
    submittedAt: Number(row.submitted_at),
    commitmentHash: row.commitment_hash,
    payload: row.payload,
  };
}

export async function listLifecycleEvents(limit = 1_000): Promise<LifecycleEvent[]> {
  if (!Number.isInteger(limit) || limit <= 0 || limit > 10_000) {
    throw new Error('INVALID_LIFECYCLE_EVENT_LIMIT');
  }

  if (ENV.DATABASE_URL) {
    const { rows } = await db.query(
      `select event_id, chain_id, contract_address, contract_name, event_name, category, fund_id,
              transaction_hash, log_index, block_number, occurred_at, submitted_at, commitment_hash, payload
       from lifecycle_event
       order by block_number asc, log_index asc
       limit $1`,
      [limit],
    );
    return rows.map(rowToLifecycleEvent);
  }

  return sortLifecycleEvents([...memoryLifecycleEvents.values()]).slice(0, limit);
}

export function clearMemoryLifecycleEvents(): void {
  memoryLifecycleEvents.clear();
}
