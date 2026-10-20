import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { actorNames, auditCase, assertCaseExpectations } from './audit-case.mjs';
import { ROOT } from './evidence.mjs';
import { verifyCase } from './verify-run.mjs';

const folder = resolve(ROOT, 'docs/evidence/paper85/v3-revision/2026-10-20T01-15-00.607Z-f5edfdac');
const input = JSON.parse(gunzipSync(await readFile(resolve(folder, 'case/replay.json.gz'))));
const summary = JSON.parse(await readFile(resolve(folder, 'C-case-summary.json'), 'utf8'));
const spec = JSON.parse(await readFile(resolve(ROOT,
  'experiments/paper85-evaluation/spec-v3/case-expectations.postreview.json'), 'utf8'));
const query = (events = input.decoded, checkpoints = [], pricingPolicy = { suspensions: input.pricingPolicy.suspensions }) =>
  auditCase({ genesis: input.genesis, events, checkpoints, pricingPolicy, names: actorNames(spec) });

test('all seven case queries reproduce the sealed answers and post-review expectations', () => {
  const result = verifyCase(input, summary, spec);
  assert.deepEqual(result.questions, ['Q1', 'Q2', 'Q3', 'Q4', 'Q5', 'Q6', 'Q7']);
  assert.equal(result.affectedBusinesses, 1);
});

test('Q2 uses the last of multiple same-date corrections', () => {
  const events = structuredClone(input.decoded);
  const correction = events.findIndex((e) => e.eventName === 'NAVUpdatedEvent' && e.args.asOf !== e.args.storedAt);
  const extra = structuredClone(events[correction]);
  extra.args.nav = (BigInt(extra.args.nav) - 10n ** 16n).toString();
  events.splice(correction + 1, 0, extra);
  const result = query(events);
  assert.deepEqual(result.corrections.correctionOf, [null, null, null, 2, 3, null]);
  assert.equal(result.corrections.latestVersion[2], 4);
  assert.equal(result.answers.Q2.affected[0].overpayment, (2000n * 10n ** 18n).toString());
  assert.equal(result.answers.Q5.corrections, 2);
});

test('Q2 derives an empty affected set when no NAV is corrected', () => {
  const events = input.decoded.filter((e) => e.eventName !== 'NAVUpdatedEvent' || e.args.asOf === e.args.storedAt);
  assert.deepEqual(query(events).answers.Q2.affected, []);
});

test('Q3 checks eligibility at each movement, rather than using final eligibility', () => {
  const events = structuredClone(input.decoded);
  events.find((e) => e.eventName === 'InvestorWhitelisted' && e.args.investor.toLowerCase() === spec.actors.A).args.eligible = false;
  const { Q3 } = query(events).answers;
  assert.equal(Q3.movements, 6);
  assert.equal(Q3.eligibleAtTime, 3);
});

test('Q4 counts only events inside actual pause/resume boundaries', () => {
  const events = input.decoded.filter((e) => !['Paused', 'Unpaused'].includes(e.eventName));
  assert.deepEqual(query(events).answers.Q4,
    { shareMovements: 0, redemptionRequests: 0, subscriptionRequests: 0, navVersions: 0 });
});

test('Q5 detects a missing evidence payload', () => {
  const events = structuredClone(input.decoded);
  events.find((e) => e.eventName === 'NAVUpdatedEvent').args.payloadHash = `0x${'0'.repeat(64)}`;
  assert.equal(query(events).answers.Q5.allWithSubmitterAndPayload, false);
});

test('Q6 recomputes projection matches against independently supplied checkpoints', () => {
  const checkpoints = structuredClone(input.checkpoints);
  checkpoints[0].view.totalSupply = '1';
  assert.deepEqual(query(input.decoded, checkpoints).answers.Q6, { matched: 22, checkpoints: 23 });
});

test('Q7 derives the delay reason and exact duration from events', () => {
  const { delayed } = query().answers.Q7;
  assert.equal(delayed.length, 1);
  assert.equal(delayed[0].investor, 'B');
  assert.equal(delayed[0].settlementLagSec, 26.5 * 3600);
  assert.equal(delayed[0].reasonHash, spec.expected['Q7.delayed'][0].reasonHash);
});

for (const question of ['Q2', 'Q3', 'Q4', 'Q5', 'Q6', 'Q7']) {
  test(`verifier rejects an incorrect ${question} answer even when other summaries agree`, () => {
    const corrupted = structuredClone(summary);
    if (question === 'Q2') corrupted.answers.Q2.affected = [];
    if (question === 'Q3') corrupted.answers.Q3.detail[0].eligible = false;
    if (question === 'Q4') corrupted.answers.Q4.redemptionRequests = 0;
    if (question === 'Q5') corrupted.answers.Q5.detail[3].correctionOf = null;
    if (question === 'Q6') corrupted.answers.Q6.matched = 0;
    if (question === 'Q7') corrupted.answers.Q7.delayed[0].settlementLagSec++;
    assert.throws(() => verifyCase(input, corrupted, spec), new RegExp(`Archived case answer ${question}`));
  });
}

test('machine-readable expectations are enforced independently of archived answers', () => {
  const wrong = structuredClone(spec);
  wrong.expected['Q2.affected'] = [];
  assert.throws(() => assertCaseExpectations(query().answers, wrong), /Case expectation Q2/);
});

test('verification CLI refuses to place a report inside its input directory', async (t) => {
  const temporary = await mkdtemp(join(tmpdir(), 'paper85-report-'));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const result = spawnSync(process.execPath,
    [resolve(ROOT, 'experiments/paper85-evaluation/scripts/v3/verify-run.mjs'), temporary, join(temporary, 'report.json')],
    { encoding: 'utf8' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Report must be outside the sealed run/);
});
