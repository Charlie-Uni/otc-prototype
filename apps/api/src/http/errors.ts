const DOMAIN_ERROR_STATUS = {
  REDEMPTION_GATED: 409,
  RISK_GATE_NOT_CONFIGURED: 503,
} as const;

type HttpError = {
  statusCode: number;
  code: string;
};

function errorStrings(value: unknown, seen = new Set<unknown>()): string[] {
  if (typeof value === 'string') return [value];
  if (value === null || typeof value !== 'object' || seen.has(value)) return [];

  seen.add(value);
  const record = value as Record<string, unknown>;
  return [
    ...errorStrings(record.shortMessage, seen),
    ...errorStrings(record.details, seen),
    ...errorStrings(record.message, seen),
    ...errorStrings(record.cause, seen),
  ];
}

function explicitStatusCode(error: unknown): number | null {
  if (error === null || typeof error !== 'object') return null;
  const statusCode = (error as { statusCode?: unknown }).statusCode;
  return Number.isInteger(statusCode) && Number(statusCode) >= 400 && Number(statusCode) <= 599
    ? Number(statusCode)
    : null;
}

function stableErrorCode(error: unknown): string | null {
  if (error === null || typeof error !== 'object') return null;
  const message = (error as { message?: unknown }).message;
  return typeof message === 'string' && /^[A-Z][A-Z0-9_]+$/.test(message)
    ? message
    : null;
}

function containsDomainErrorCode(message: string, code: string): boolean {
  const escapedCode = code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|[^A-Z0-9_])${escapedCode}(?:$|[^A-Z0-9_])`).test(message);
}

export function classifyHttpError(error: unknown): HttpError {
  const combined = errorStrings(error).join('\n');
  for (const [code, statusCode] of Object.entries(DOMAIN_ERROR_STATUS)) {
    if (containsDomainErrorCode(combined, code)) {
      return { statusCode, code };
    }
  }

  const statusCode = explicitStatusCode(error);
  if (statusCode !== null) {
    return {
      statusCode,
      code: stableErrorCode(error) ?? 'REQUEST_FAILED',
    };
  }

  return { statusCode: 500, code: 'INTERNAL_ERROR' };
}
