export type RiskSnapshotContext = {
  blockNumber: bigint;
  blockTimestamp: number;
};

function invalidRequest(code: string): Error {
  return Object.assign(new Error(code), { statusCode: 400 });
}

export function validateRiskSnapshotTime(
  occurredAt: number,
  context: RiskSnapshotContext,
  maxInputAgeSec: number,
): void {
  if (!Number.isInteger(occurredAt) || occurredAt <= 0) {
    throw invalidRequest('INVALID_OCCURRED_AT');
  }
  if (!Number.isInteger(context.blockTimestamp) || context.blockTimestamp <= 0) {
    throw new Error('INVALID_SNAPSHOT_BLOCK_TIMESTAMP');
  }
  if (!Number.isInteger(maxInputAgeSec) || maxInputAgeSec <= 0) {
    throw new Error('INVALID_RISK_INPUT_MAX_AGE');
  }
  if (occurredAt > context.blockTimestamp) {
    throw invalidRequest('RISK_OCCURRED_AT_AFTER_SNAPSHOT');
  }
  if (context.blockTimestamp - occurredAt > maxInputAgeSec) {
    throw invalidRequest('RISK_INPUT_TOO_OLD');
  }
}
