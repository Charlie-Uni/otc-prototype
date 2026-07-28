/**
 * Bounded retention policy for the in-memory audit buffer.
 *
 * The buffer is capped, so without a policy an anonymous caller hammering the
 * unauthenticated public views could flush privileged evidence (risk.submit,
 * eligibility.mark, gate release, ...) out of the buffer. The rule here:
 * when the cap is exceeded, evict the oldest unauthenticated entry first, and
 * only fall back to plain FIFO when no unauthenticated entry remains.
 */
export const PUBLIC_AUDIT_ACTOR = 'api:public';

export function csvEscape(value: unknown): string {
  const text = typeof value === 'string' ? value : JSON.stringify(value) ?? String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

export function pushBoundedAuditEntry<T extends { actor: string }>(
  log: T[],
  entry: T,
  maxEntries: number,
): void {
  log.push(entry);
  if (log.length <= maxEntries) {
    return;
  }

  const oldestAnonymousIndex = log.findIndex((candidate) => candidate.actor === PUBLIC_AUDIT_ACTOR);
  if (oldestAnonymousIndex !== -1) {
    log.splice(oldestAnonymousIndex, 1);
    return;
  }
  log.splice(0, log.length - maxEntries);
}
