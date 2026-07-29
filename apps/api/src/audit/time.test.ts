import assert from 'node:assert/strict';
import test from 'node:test';
import { causalObservationTime } from './time';

test('keeps observedAt causal across wall-clock and simulated-chain time domains', () => {
  assert.equal(causalObservationTime(1_300, [1_000, 1_100]), 1_300);
  assert.equal(causalObservationTime(1_000, [1_100, null, undefined]), 1_100);
  assert.throws(() => causalObservationTime(-1), /INVALID_OBSERVATION_TIME/);
});
