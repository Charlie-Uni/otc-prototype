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
const MAX_MEMORY_AUDIT_ENTRIES = 5_000;

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
  if (memoryAuditLog.length > MAX_MEMORY_AUDIT_ENTRIES) {
    memoryAuditLog.splice(0, memoryAuditLog.length - MAX_MEMORY_AUDIT_ENTRIES);
  }

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

function nullableNumber(value: unknown): number | null {
  return value === null || value === undefined ? null : Number(value);
}

function auditEntryFromRow(row: Record<string, unknown>): AuditEntry {
  return {
    actor: String(row.actor),
    action: String(row.action),
    occurredAt: nullableNumber(row.occurred_at),
    submittedAt: nullableNumber(row.submitted_at),
    disclosedAt: nullableNumber(row.disclosed_at),
    observedAt: Number(row.observed_at),
    transactionHash: row.transaction_hash as `0x${string}` | null,
    details: typeof row.payload === 'string'
      ? JSON.parse(row.payload)
      : row.payload as Record<string, unknown>,
  };
}

export async function listAuditEntries(limit: number): Promise<AuditEntry[]> {
  if (!Number.isInteger(limit) || limit <= 0 || limit > 1_000) {
    throw Object.assign(new Error('INVALID_AUDIT_LIMIT'), { statusCode: 400 });
  }
  if (!ENV.DATABASE_URL) {
    return memoryAuditLog.slice(-limit);
  }

  const { rows } = await db.query(
    `select actor, action, occurred_at, submitted_at, disclosed_at, observed_at, transaction_hash, payload
     from audit_log order by id desc limit $1`,
    [limit],
  );
  return rows.reverse().map(auditEntryFromRow);
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
