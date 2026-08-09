import assert from 'node:assert/strict';
import test from 'node:test';
import { TICK_STAGES, eventWindowFromShock, runTickStages, tickStartAt } from './pipeline';

test('freezes the chapter 5 within-tick causal order', () => {
  const observed: string[] = [];
  runTickStages((stage) => observed.push(stage));
  assert.deepEqual(observed, [
    'apply_shock',
    'submit_oracle_state',
    'apply_disclosure_policy',
    'observe_disclosures',
    'update_beliefs',
    'decide_redemptions',
    'queue_and_settle',
    'update_nav',
    'propagate_network_effects',
  ]);
  assert.equal(new Set(TICK_STAGES).size, TICK_STAGES.length);
});

test('maps one abstract tick to exactly one day', () => {
  assert.equal(tickStartAt(1_000, 3), 1_000 + 3 * 86_400);
});

test('anchors analysis windows to shock event time rather than calendar tick zero', () => {
  assert.deepEqual(eventWindowFromShock(12_345, 30), {
    startSec: 12_345,
    endExclusiveSec: 12_345 + 30 * 86_400,
  });
});
