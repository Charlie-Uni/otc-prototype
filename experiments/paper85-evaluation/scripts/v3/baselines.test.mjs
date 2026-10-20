import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { gzipSync, gunzipSync } from 'node:zlib';
import { ROOT } from './evidence.mjs';
import { classifyScenario, gasStatistics, gasTable } from './audit-baselines.mjs';
import { verifyClassifications, verifyRecoverability, verifyGas } from './verify-baselines.mjs';
import { TABLE_COVERAGE, verifyTableDisplays } from './table-coverage.mjs';

const parent = resolve(ROOT, 'docs/evidence/paper85/v3-revision');
const candidates = [];
for (const name of await readdir(parent)) {
  if (!/^\d{4}-/.test(name)) continue;
  const run = JSON.parse(await readFile(resolve(parent, name, 'run.json')));
  if (run.commit === '347ea2636dce91b5381f72c084006de8aea971aa') candidates.push(resolve(parent, name));
}
const archive = process.env.PAPER85_TEST_EVIDENCE ?? (candidates.length === 1 ? candidates[0] : null);
assert(archive, 'Set PAPER85_TEST_EVIDENCE to one sealed 347ea26 measurement run');
const json = async (path) => JSON.parse(await readFile(path, 'utf8'));
const summary = await json(resolve(archive, 'A-summary.json'));
const rows = await json(resolve(archive, 'A-scenario-rows.json'));
const claims = await json(resolve(ROOT, 'docs/manuscript/paper85-v3.1/paper85-section5-claims.json'));

// Copy only baseline evidence into a disposable directory. Mutation fixtures
// never open original archive files for writing or follow writable symlinks.
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'paper85-baseline-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const folder of ['chains', 'trajectories', 'canonical', 'build']) {
    await mkdir(resolve(root, folder), { recursive: true });
    for (const name of await readdir(resolve(archive, folder))) {
      const needed = folder === 'chains' ? /^(186\d\d-|canonical-1910)/.test(name)
        : folder === 'canonical' ? name === '18660.json.gz'
        : folder === 'build' ? /^B[12].*\.artifact\.json$/.test(name) : true;
      if (needed) await cp(resolve(archive, folder, name), resolve(root, folder, name));
    }
  }
  return root;
}

async function mutateTape(root, prefix, update) {
  const names = (await readdir(resolve(root, 'chains'))).filter((name) => name.startsWith(prefix));
  assert.equal(names.length, 1);
  const path = resolve(root, 'chains', names[0]);
  const tape = gunzipSync(await readFile(path)).toString().trim().split('\n').map(JSON.parse);
  update(tape);
  await writeFile(path, gzipSync(`${tape.map((entry) => JSON.stringify(entry)).join('\n')}\n`));
}

test('Table 8 derives every label, totals and predicate counts from preserved inputs', async () => {
  const result = await verifyClassifications(archive, rows, summary.scenarioComparison);
  assert.equal(result.rows, 84); assert.equal(result.executedRows, 50);
  assert.equal(result.totals.B1.invalidBlocked, 3); assert.equal(result.totals.B2.invalidBlocked, 13);
});

test('Table 8 distinguishes successful zero-value writes from balance-changing writes', () => {
  const zero = rows.find((row) => row.id === 'I18' && row.comparator === 'B1');
  assert.equal(classifyScenario(zero, true), 'accepted_no_state_change');
  const changed = structuredClone(zero); changed.after.bob = '1'; changed.ledgerChanged = true;
  assert.equal(classifyScenario(changed, true), 'accepted_state_change');
  changed.ledgerChanged = false;
  assert.throws(() => classifyScenario(changed, true), /Ledger change flag/);
});

test('Table 8 rejects a fabricated observed label even with match=true', async () => {
  const wrong = structuredClone(rows); wrong.find((row) => row.status === 'accepted').observed = 'blocked';
  await assert.rejects(verifyClassifications(archive, wrong, summary.scenarioComparison), /classification/);
});

test('Table 8 cross-checks balance snapshots against fixture and action receipt logs', async () => {
  const wrong = structuredClone(rows); wrong.find((row) => row.id === 'I06').after.alice = '1';
  await assert.rejects(verifyClassifications(archive, wrong, summary.scenarioComparison), /after state/);
});

test('Table 8 rejects duplicate scenario IDs and false capability absence', async () => {
  const wrong = structuredClone(rows); wrong[1] = wrong[0];
  await assert.rejects(verifyClassifications(archive, wrong, summary.scenarioComparison), /Duplicate scenario/);
  const unrepresented = structuredClone(rows.find((row) => row.observed === 'not_representable'));
  unrepresented.status = 'accepted';
  assert.throws(() => classifyScenario(unrepresented, false), /Unrepresentable operation/);
});

test('Table 8 scopes receipts to snapshot boundaries, rather than global transaction hashes', async (t) => {
  const root = await fixture(t);
  await mutateTape(root, '18645-', (tape) => {
    const marker = tape.find((record) => record.kind === 'snapshot-revert'); marker.scenario = 'I24';
  });
  await assert.rejects(verifyClassifications(root, rows, summary.scenarioComparison), /Snapshot boundary/);
});

test('Table 9 replays both comparators and preserves unrecorded components', async () => {
  const result = await verifyRecoverability(archive, summary.recoverability);
  assert.equal(result.productionCheckpoints, 14);
  for (const kind of ['B1', 'B2']) {
    assert.equal(result.comparators[kind].components.balances.matched, 14);
    assert.equal(result.comparators[kind].components.navHistory.recorded, false);
    assert.equal(result.comparators[kind].components.completeProjection.matched, 0);
  }
  assert.equal(result.comparators.B2.components.completeProjectionValueEquality.matched, 2);
});

test('Table 9 rejects an incorrect component count', async () => {
  const wrong = structuredClone(summary.recoverability); wrong.comparators.B2.components.balances.matched--;
  await assert.rejects(verifyRecoverability(archive, wrong), /Table 9 recoverability/);
});

test('Table 9 binds trajectory raw logs to the originating receipts', async (t) => {
  const root = await fixture(t); const path = resolve(root, 'trajectories/B2-18671.json');
  const input = await json(path); input.rawLogs[0].data = `0x${'0'.repeat(64)}`;
  await writeFile(path, JSON.stringify(input));
  await assert.rejects(verifyRecoverability(root, summary.recoverability), /Raw logs \/ receipt logs/);
});

test('Table 10 reconstructs 130 operation receipts, statistics and displayed workflow ratios', async () => {
  const result = await verifyGas(archive, summary);
  assert.equal(result.operationReceipts, 130); assert.equal(result.freshTrajectories, 15);
  assert.equal(result.table.subscription.displayedRatioToB2, '4.39');
  assert.equal(result.table.redemption.displayedRatioToB2, '7.95');
});

test('gas statistics use sample SD and workflows sum rather than average request/effect', () => {
  assert.deepEqual(gasStatistics([1, 2, 3]), { samples: 3, meanGas: 2, sdGas: 1, min: 1, max: 3 });
  const result = gasTable(summary.productionGas.operations, summary.comparatorGas);
  assert.equal(result.subscription.productionMeanGas, 147060 + 186774);
  assert.equal(result.qualification.productionMeanGas, (50152 + 50164) / 2);
  assert.throws(() => gasStatistics([]), /Invalid gas samples/);
});

test('Table 10 rejects a summary gas change without trusting the recalculated mean', async () => {
  const wrong = structuredClone(summary); wrong.productionGas.operations.O01.meanGas++;
  await assert.rejects(verifyGas(archive, wrong), /Production gas aggregates/);
});

test('Table 10 rejects a corrupted authoritative receipt', async (t) => {
  const root = await fixture(t);
  await mutateTape(root, 'canonical-19100', (tape) => {
    const record = tape.find((row) => row.input?.label === 'whitelist Alice'); record.receipt.gasUsed = '1';
  });
  await assert.rejects(verifyGas(root, summary), /Production receipt gas/);
});

test('Table 10 validates operation categories, not just their gas totals', async (t) => {
  const root = await fixture(t); const path = resolve(root, 'trajectories/B1-18680.json');
  const input = await json(path); input.steps[4].opType = 'redemption';
  await writeFile(path, JSON.stringify(input));
  await assert.rejects(verifyGas(root, summary), /Canonical operation category/);
});

test('displayed Table 8–10 cells match recomputed values, and coverage discloses inherited evidence', async () => {
  const tables = { table8: await verifyClassifications(archive, rows, summary.scenarioComparison),
    table9: await verifyRecoverability(archive, summary.recoverability), table10: await verifyGas(archive, summary) };
  assert.equal(verifyTableDisplays(claims, tables).matched, true);
  for (const table of ['8', '9', '10']) {
    const wrong = structuredClone(claims);
    wrong.tables[table].displayedCells[1][table === '8' ? 3 : 1] = '999';
    assert.throws(() => verifyTableDisplays(wrong, tables));
  }
  assert.equal(Object.keys(TABLE_COVERAGE).length, 11);
  assert.equal(TABLE_COVERAGE[6].status, 'inherited-not-recomputed');
  assert.equal(TABLE_COVERAGE[7].status, 'inherited-not-recomputed');
  assert.match(TABLE_COVERAGE[8].limits, /Prototype column/);
});

test('complete offline verification succeeds when Git is unavailable', () => {
  const result = spawnSync(process.execPath, [resolve(ROOT, 'experiments/paper85-evaluation/scripts/v3/verify-run.mjs'), archive],
    { env: { ...process.env, PATH: '' }, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.status, 'passed'); assert.equal(report.verifier.gitAvailable, false);
  assert.equal(report.verifier.commit, null); assert.equal(report.verifier.governedInputsDirty, null);
  assert.equal(report.measurement.sealedFilesVerified, 101);
});
