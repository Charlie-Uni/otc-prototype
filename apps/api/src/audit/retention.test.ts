import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PUBLIC_AUDIT_ACTOR, csvEscape, pushBoundedAuditEntry } from './retention';

type Entry = { actor: string; action: string };

function fill(log: Entry[], actor: string, action: string, count: number, max: number) {
  for (let i = 0; i < count; i += 1) {
    pushBoundedAuditEntry(log, { actor, action: `${action}-${i}` }, max);
  }
}

test('buffer stays within the configured bound', () => {
  const log: Entry[] = [];
  fill(log, PUBLIC_AUDIT_ACTOR, 'risk.public.observe', 25, 10);
  assert.equal(log.length, 10);
});

test('anonymous flood cannot evict privileged audit evidence', () => {
  const max = 10;
  const log: Entry[] = [];
  pushBoundedAuditEntry(log, { actor: 'api:risk_oracle', action: 'risk.submit' }, max);
  pushBoundedAuditEntry(log, { actor: 'api:registrar', action: 'eligibility.mark' }, max);

  // 5000-style anonymous flush attempt.
  fill(log, PUBLIC_AUDIT_ACTOR, 'risk.public.observe', 100, max);

  assert.equal(log.length, max);
  assert.ok(log.some((entry) => entry.action === 'risk.submit'));
  assert.ok(log.some((entry) => entry.action === 'eligibility.mark'));
  // Remaining slots hold the newest anonymous observations.
  assert.equal(log.filter((entry) => entry.actor === PUBLIC_AUDIT_ACTOR).length, max - 2);
  assert.equal(log[log.length - 1].action, 'risk.public.observe-99');
});

test('a buffer full of privileged entries falls back to FIFO eviction', () => {
  const max = 5;
  const log: Entry[] = [];
  fill(log, 'api:auditor', 'audit.api.read', 7, max);

  assert.equal(log.length, max);
  assert.equal(log[0].action, 'audit.api.read-2');
  assert.equal(log[log.length - 1].action, 'audit.api.read-6');
});

test('an anonymous entry arriving at a privileged-full buffer does not displace privileged evidence', () => {
  const max = 3;
  const log: Entry[] = [];
  fill(log, 'api:regulator', 'risk.gate.release', 3, max);

  pushBoundedAuditEntry(log, { actor: PUBLIC_AUDIT_ACTOR, action: 'risk.public.observe' }, max);

  assert.equal(log.length, max);
  assert.ok(log.every((entry) => entry.actor === 'api:regulator'));
});

test('csvEscape doubles quotes and serializes objects', () => {
  assert.equal(csvEscape('say "hi"'), '"say ""hi"""');
  assert.equal(csvEscape({ a: 1 }), '"{""a"":1}"');
});
