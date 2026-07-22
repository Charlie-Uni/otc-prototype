import { db } from '../db/client';
import { ENV } from '../env';

export type AuditEntry = {
  actor: string;
  action: string;
  occurredAt: number | null;
  submittedAt: number | null;
  disclosedAt: number | null;
  observedAt: number;
  transactionHash: `0x${string}` | null;
  details: Record<string, unknown>;
};

export type RecordAuditInput = {
  actor: string;
  action: string;
  details?: Record<string, unknown>;
  occurredAt?: number | null;
  submittedAt?: number | null;
  disclosedAt?: number | null;
  observedAt?: number;
  transactionHash?: `0x${string}` | null;
};

const memoryAuditLog: AuditEntry[] = [];

function nowSec(): number {
  return Math.floor(Date.now() / 1000);
}

function csvEscape(value: unknown): string {
  const text = typeof value === 'string' ? value : JSON.stringify(value) ?? String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

export async function recordAudit(input: RecordAuditInput): Promise<AuditEntry> {
  const entry: AuditEntry = {
    actor: input.actor,
    action: input.action,
    occurredAt: input.occurredAt ?? null,
    submittedAt: input.submittedAt ?? null,
    disclosedAt: input.disclosedAt ?? null,
    observedAt: input.observedAt ?? nowSec(),
    transactionHash: input.transactionHash ?? null,
    details: input.details ?? {},
  };
  memoryAuditLog.push(entry);

  if (ENV.DATABASE_URL) {
    await db.query(
      `insert into audit_log(
         actor, action, occurred_at, submitted_at, disclosed_at, observed_at, transaction_hash, payload
       ) values($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        entry.actor,
        entry.action,
        entry.occurredAt,
        entry.submittedAt,
        entry.disclosedAt,
        entry.observedAt,
        entry.transactionHash,
        JSON.stringify(entry.details),
      ],
    );
  }

  return entry;
}

export function getAuditEntries() {
  return [...memoryAuditLog];
}

export function clearMemoryAuditEntries(): void {
  memoryAuditLog.length = 0;
}

export async function exportAuditCsv() {
  if (ENV.DATABASE_URL) {
    const { rows } = await db.query(
      `select actor, action, occurred_at, submitted_at, disclosed_at, observed_at, transaction_hash, payload
       from audit_log order by id asc`,
    );
    return [
      'actor,action,occurredAt,submittedAt,disclosedAt,observedAt,transactionHash,payload',
      ...rows.map((row: any) => [
        csvEscape(row.actor),
        csvEscape(row.action),
        csvEscape(row.occurred_at),
        csvEscape(row.submitted_at),
        csvEscape(row.disclosed_at),
        csvEscape(row.observed_at),
        csvEscape(row.transaction_hash),
        csvEscape(row.payload),
      ].join(',')),
    ].join('\n');
  }

  return [
    'actor,action,occurredAt,submittedAt,disclosedAt,observedAt,transactionHash,payload',
    ...memoryAuditLog.map((entry) => [
      csvEscape(entry.actor),
      csvEscape(entry.action),
      csvEscape(entry.occurredAt),
      csvEscape(entry.submittedAt),
      csvEscape(entry.disclosedAt),
      csvEscape(entry.observedAt),
      csvEscape(entry.transactionHash),
      csvEscape(entry.details),
    ].join(',')),
  ].join('\n');
}
