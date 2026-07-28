/**
 * One-retry submission protocol for risk metrics.
 *
 * The thesis-facing invariant: when the weights configuration rotates between
 * snapshot computation and on-chain submission (INACTIVE_WEIGHTS), the whole
 * computed batch is discarded and recomputed once against a fresh block —
 * never partially reused. Any other error propagates unchanged, and a second
 * INACTIVE_WEIGHTS failure surfaces as RISK_SUBMIT_RETRY_EXHAUSTED.
 *
 * Extracted from the route handler with injected dependencies so this
 * discard-and-recompute rule is unit-testable without a chain.
 */
export type SubmitRiskDeps<C, S> = {
  /** Recompute the full submission batch from the currently active chain config. */
  compute: () => Promise<C>;
  /** Send the transaction for a computed batch; resolves once it is mined. */
  submit: (computed: C) => Promise<`0x${string}`>;
  /** Verify the stored snapshot matches the computed batch; throws on mismatch. */
  confirm: (computed: C, tx: `0x${string}`) => Promise<S>;
};

export type SubmitRiskResult<C, S> = {
  computed: C;
  tx: `0x${string}`;
  snapshot: S;
  retried: boolean;
};

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function submitRiskWithOneConfigRetry<C, S>(
  deps: SubmitRiskDeps<C, S>,
): Promise<SubmitRiskResult<C, S>> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const computed = await deps.compute();
    try {
      const tx = await deps.submit(computed);
      const snapshot = await deps.confirm(computed, tx);
      return { computed, tx, snapshot, retried: attempt > 0 };
    } catch (error) {
      if (attempt === 0 && messageOf(error).includes('INACTIVE_WEIGHTS')) {
        continue;
      }
      throw error;
    }
  }

  throw new Error('RISK_SUBMIT_RETRY_EXHAUSTED');
}
