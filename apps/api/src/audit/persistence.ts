import type { LifecycleEvent } from './lifecycle';

/**
 * Pure lifecycle-event persistence policy with injected storage dependencies.
 *
 * Lives in its own module (no ../env or ../chain imports) so unit tests can
 * exercise the PostgreSQL/memory storage split without requiring a populated
 * .env — the indexer wires in the real ENV, db client, and memory map.
 */
export type LifecyclePersistenceDeps = {
  databaseUrl?: string;
  query: (sql: string, values: unknown[]) => Promise<{ rowCount: number | null }>;
  memoryEvents: Map<string, LifecycleEvent>;
};

export async function persistLifecycleEventWithDeps(
  event: LifecycleEvent,
  deps: LifecyclePersistenceDeps,
): Promise<boolean> {
  if (!deps.databaseUrl) {
    const inserted = !deps.memoryEvents.has(event.eventId);
    deps.memoryEvents.set(event.eventId, event);
    return inserted;
  }

  const result = await deps.query(
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
  return (result.rowCount ?? 0) > 0;
}
