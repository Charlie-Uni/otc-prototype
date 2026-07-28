import assert from 'node:assert/strict';
import { test } from 'node:test';
import { submitRiskWithOneConfigRetry } from './submit-retry';

type Batch = { configId: number };

function makeDeps(overrides: {
  computeResults?: Batch[];
  submitError?: (batch: Batch, call: number) => Error | null;
  confirmError?: Error | null;
}) {
  const calls = { compute: 0, submit: 0, confirm: 0 };
  return {
    calls,
    deps: {
      compute: async (): Promise<Batch> => {
        const batch = overrides.computeResults?.[calls.compute] ?? { configId: calls.compute + 1 };
        calls.compute += 1;
        return batch;
      },
      submit: async (batch: Batch): Promise<`0x${string}`> => {
        calls.submit += 1;
        const error = overrides.submitError?.(batch, calls.submit);
        if (error) throw error;
        return `0x${String(calls.submit).padStart(64, '0')}` as `0x${string}`;
      },
      confirm: async (batch: Batch) => {
        calls.confirm += 1;
        if (overrides.confirmError) throw overrides.confirmError;
        return { confirmedConfigId: batch.configId };
      },
    },
  };
}

test('successful first attempt is not marked as retried', async () => {
  const { deps, calls } = makeDeps({});
  const result = await submitRiskWithOneConfigRetry(deps);

  assert.equal(result.retried, false);
  assert.equal(result.computed.configId, 1);
  assert.equal(result.snapshot.confirmedConfigId, 1);
  assert.equal(calls.compute, 1);
});

test('INACTIVE_WEIGHTS discards the whole batch and recomputes once against fresh config', async () => {
  const { deps, calls } = makeDeps({
    computeResults: [{ configId: 1 }, { configId: 2 }],
    submitError: (_batch, call) => (call === 1 ? new Error('execution reverted: INACTIVE_WEIGHTS') : null),
  });

  const result = await submitRiskWithOneConfigRetry(deps);

  assert.equal(result.retried, true);
  // The retried submission must come from the second compute, never a reused batch.
  assert.equal(result.computed.configId, 2);
  assert.equal(result.snapshot.confirmedConfigId, 2);
  assert.equal(calls.compute, 2);
  assert.equal(calls.submit, 2);
});

test('a second INACTIVE_WEIGHTS failure surfaces as RISK_SUBMIT_RETRY_EXHAUSTED', async () => {
  const { deps } = makeDeps({
    submitError: () => new Error('execution reverted: INACTIVE_WEIGHTS'),
  });

  await assert.rejects(
    () => submitRiskWithOneConfigRetry(deps),
    /INACTIVE_WEIGHTS/,
  );
});

test('non-config errors propagate unchanged without retrying', async () => {
  const { deps, calls } = makeDeps({
    submitError: () => new Error('NONCE_TOO_LOW'),
  });

  await assert.rejects(() => submitRiskWithOneConfigRetry(deps), /NONCE_TOO_LOW/);
  assert.equal(calls.compute, 1);
  assert.equal(calls.submit, 1);
});

test('confirmation mismatch propagates and is not swallowed by the retry path', async () => {
  const { deps, calls } = makeDeps({
    confirmError: new Error('RISK_SNAPSHOT_CONFIRMATION_FAILED'),
  });

  await assert.rejects(() => submitRiskWithOneConfigRetry(deps), /RISK_SNAPSHOT_CONFIRMATION_FAILED/);
  assert.equal(calls.compute, 1);
});
