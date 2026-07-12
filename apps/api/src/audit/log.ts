import { db } from '../db/client';
import { ENV } from '../env';

export type AuditEntry = {
  actor: string;
  action: string;
  observedAt: number;
  details: Record<string, unknown>;
};

const memoryAuditLog: AuditEntry[] = [];

function nowSec(): number {
  return Math.floor(Date.now() / 1000);
}

function csvEscape(value: unknown): string {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return `"${text.replace(/"/g, '""')}"`;
}

export function recordAudit(action: string, details: Record<string, unknown>, actor = 'risk-api') {
  const entry = { actor, action, observedAt: nowSec(), details };
  memoryAuditLog.push(entry);

  if (ENV.DATABASE_URL) {
    void db
      .query(
        'insert into audit_log(actor, action, payload) values($1, $2, $3)',
        [actor, action, JSON.stringify({ observedAt: entry.observedAt, ...details })],
      )
      .catch((error: unknown) => {
        console.error('audit_log insert failed', error);
      });
  }
}

export function getAuditEntries() {
  return memoryAuditLog;
}

export async function exportAuditCsv() {
  if (ENV.DATABASE_URL) {
    const { rows } = await db.query(
      'select actor, action, extract(epoch from at)::bigint as observed_at, payload from audit_log order by id asc',
    );
    return [
      'actor,action,observedAt,payload',
      ...rows.map((row: any) => [
        csvEscape(row.actor),
        csvEscape(row.action),
        csvEscape(row.observed_at),
        csvEscape(row.payload),
      ].join(',')),
    ].join('\n');
  }

  return [
    'actor,action,observedAt,payload',
    ...memoryAuditLog.map((entry) => [
      csvEscape(entry.actor),
      csvEscape(entry.action),
      csvEscape(entry.observedAt),
      csvEscape(entry.details),
    ].join(',')),
  ].join('\n');
}
