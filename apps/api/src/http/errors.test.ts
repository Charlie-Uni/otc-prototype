import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyHttpError } from './errors';

test('maps nested gate reverts to a stable conflict response', () => {
  const error = {
    message: 'ContractFunctionExecutionError',
    cause: {
      shortMessage: 'The contract function reverted with reason: REDEMPTION_GATED',
    },
  };

  assert.deepEqual(classifyHttpError(error), {
    statusCode: 409,
    code: 'REDEMPTION_GATED',
  });
});

test('maps an unconfigured gate to service unavailable without exposing internals', () => {
  assert.deepEqual(
    classifyHttpError(new Error('execution reverted: RISK_GATE_NOT_CONFIGURED')),
    {
      statusCode: 503,
      code: 'RISK_GATE_NOT_CONFIGURED',
    },
  );
});

test('does not classify a longer error code by substring', () => {
  assert.deepEqual(
    classifyHttpError(new Error('execution reverted: REDEMPTION_GATED_RELEASED')),
    {
      statusCode: 500,
      code: 'INTERNAL_ERROR',
    },
  );
});

test('preserves explicit safe route errors and hides unknown failures', () => {
  assert.deepEqual(
    classifyHttpError(Object.assign(new Error('INVALID_AUDIT_QUERY'), { statusCode: 400 })),
    { statusCode: 400, code: 'INVALID_AUDIT_QUERY' },
  );
  assert.deepEqual(
    classifyHttpError(new Error('rpc failed at http://private-node')),
    { statusCode: 500, code: 'INTERNAL_ERROR' },
  );
});
