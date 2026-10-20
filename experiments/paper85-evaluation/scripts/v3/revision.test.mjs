import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { auditPricing, navCorrections } from './audit-pricing.mjs';
import { assertBuild } from './build.mjs';
import { ROOT, GOVERNED_INPUTS, assertRuntime, record, sourceIdentity, verificationIdentity } from './evidence.mjs';
import { tryWrite, viem } from './common.mjs';

const nav = (asOf, storedAt = asOf) => ({ asOf: String(asOf), storedAt: String(storedAt) });
const order = { requestedAt: '10', acceptedAt: '40', investor: 'investor' };
const policy = { correctionIndices: [], suspensions: [] };
function pricing(navs, index, request = order, p = policy) {
  const reference = { eventName: 'SubscriptionAccepted', requestId: '0', latestRecoverableNavIndex: index, referencedNavAsOf: navs[index].asOf };
  return auditPricing({ navHistory: navs, subscriptions: [request] }, [reference], p)[0];
}
test('next NAV audit rejects skipping a NAV even when the original proxy passes', () => {
  const answer = pricing([nav(20), nav(30)], 1);
  assert.equal(answer.originalAsOfProxy, true);
  assert.equal(answer.nextApplicableNavMatches, false);
  assert.equal(answer.reason, 'skipped-next-NAV');
  assert.equal(pricing([nav(20), nav(30)], 0).nextApplicableNavMatches, true);
});
test('approval/computation time, historical corrections and explicit suspension policy are distinct', () => {
  assert.equal(pricing([nav(5, 20)], 0).nextApplicableNavMatches, true);
  assert.equal(pricing([nav(20)], 0, { ...order, acceptedAt: '15' }).nextApplicableNavMatches, false);
  const p = { suspensions: [{ from: 8, resume: 30 }] };
  assert.equal(pricing([nav(5), nav(5, 20), nav(30)], 2, order, p).nextApplicableNavMatches, true);
});
test('corrections are derived by date and repeated corrections resolve to the last version', () => {
  const history = [nav(5), nav(20), nav(20, 25), nav(20, 30), nav(40)];
  assert.deepEqual(navCorrections(history), { correctionOf: [null, null, 1, 2, null],
    correctionIndices: [2, 3], latestVersion: [0, 3, 3, 3, 4] });
  assert.deepEqual(navCorrections([nav(5), nav(20)]).correctionIndices, []);
  assert.equal(pricing(history, 1, order, { suspensions: [] }).nextApplicableNavMatches, true);
  assert.throws(() => pricing(history, 1, order, policy), /correction policy/);
});

const abi = [{ type: 'function', name: 'f', stateMutability: 'nonpayable', inputs: [], outputs: [] }];
const options = (error) => ({ client: { call: async () => { throw error; } }, wallet: { account: { address: `0x${'1'.repeat(40)}` } },
  contract: { address: `0x${'2'.repeat(40)}`, abi }, functionName: 'f', recordEvidence: async () => {} });
test('transport, timeout and non-revert RPC failures abort instead of becoming blocked observations', async () => {
  for (const error of [new Error('ECONNRESET'), new Error('request timeout'), Object.assign(new Error('invalid params'), { code: -32602 }),
    Object.assign(new Error('rate limited'), { code: 429 })]) await assert.rejects(tryWrite(options(error)), (e) => e === error);
  await assert.rejects(tryWrite({ ...options(new Error('unreachable')), functionName: 'missing' }));
});
test('positive EVM execution-reverted signal counts only as a simulated rejection', async () => {
  const error = Object.assign(new Error('execution reverted: PAUSED'), { code: 3 });
  const records = [];
  const result = await tryWrite({ ...options(error), recordEvidence: async (_, value) => records.push(value) });
  assert.equal(result.status, 'rejected'); assert.equal(result.stage, 'eth_call');
  assert.equal(result.receipt, undefined);
  assert.equal(records[0].kind, 'simulated-rejection');
  const typed = new viem.ExecutionRevertedError({ message: 'execution reverted' });
  assert.equal((await tryWrite(options(typed))).status, 'rejected');
});
test('missing evidence path fails closed, including simulated rejection records', async () => {
  await assert.rejects(record({}, { kind: 'test' }), /Missing evidencePath/);
  const error = Object.assign(new Error('execution reverted: PAUSED'), { code: 3 });
  await assert.rejects(tryWrite({ ...options(error), recordEvidence: undefined }), /Missing evidencePath/);
});
test('evidence records append to an explicit temporary journal', async (t) => {
  const folder = await mkdtemp(join(tmpdir(), 'paper85-journal-'));
  t.after(() => rm(folder, { recursive: true, force: true }));
  const client = { evidencePath: join(folder, 'journal.jsonl') };
  await record(client, { index: 1n }); await record(client, { index: 2n });
  assert.deepEqual((await readFile(client.evidencePath, 'utf8')).trim().split('\n').map(JSON.parse),
    [{ index: '1' }, { index: '2' }]);
});
test('build binding detects stale creation/runtime bytecode and runtime tampering', () => {
  const artifact = { bytecode: { object: '0x1234' }, deployedBytecode: { object: '0xabcd' } };
  const compiled = { evm: { bytecode: { object: '1234' }, deployedBytecode: { object: 'abcd' } } };
  assertBuild(artifact, compiled, 'test');
  assert.throws(() => assertBuild(artifact, { evm: { ...compiled.evm, bytecode: { object: '1235' } } }, 'test'));
  assert.throws(() => assertBuild(artifact, { evm: { ...compiled.evm, deployedBytecode: { object: 'abce' } } }, 'test'));
  const art = { name: 'test', runtime: '0xaabbccdd', immutableReferences: { x: [{ start: 1, length: 2 }] } };
  assertRuntime('0xaa0000dd', art);
  assert.throws(() => assertRuntime('0xab0000dd', art));
});
test('governed input guard uses a temporary Git repository with real reference checks', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'paper85-source-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', args, { cwd: root }).toString().trim();
  const paths = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '--', ...GOVERNED_INPUTS],
    { cwd: ROOT }).toString().trim().split('\n');
  for (const path of paths) {
    const target = resolve(root, path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, await readFile(resolve(ROOT, path)));
  }
  git('init', '--quiet');
  git('config', 'user.name', 'Paper85 fixture'); git('config', 'user.email', 'fixture@example.invalid');
  git('config', 'commit.gpgsign', 'false'); git('config', 'core.hooksPath', '/dev/null');
  git('add', '.'); git('commit', '--quiet', '-m', 'fixture inputs');
  // No historical commits or tags exist in this fixture yet.
  const offline = await verificationIdentity({ root });
  assert.equal(offline.gitAvailable, true);
  assert.equal(offline.commit, git('rev-parse', 'HEAD'));
  assert.equal(offline.governedInputsDirty, false);
  git('tag', 'chapter3-artifact-v1.4.0'); git('tag', 'fixture-preregistration');
  const identity = () => sourceIdentity({ root, preregistrationRef: 'fixture-preregistration' });
  assert.equal((await identity()).governedInputsDirty, false);
  await writeFile(join(root, 'unrelated-note.txt'), 'Allowed outside the governed paths.\n');
  await identity();
  for (const path of ['experiments/paper85-evaluation/scripts/v3/run-scale.mjs', 'contracts/foundry.toml',
    'pnpm-lock.yaml', 'package.json']) {
    const absolute = resolve(root, path); const original = await readFile(absolute);
    try {
      await writeFile(absolute, Buffer.concat([original, Buffer.from('\n')]));
      await assert.rejects(identity(), /Uncommitted governed inputs/);
    } finally { await writeFile(absolute, original); }
  }
  const lock = join(root, 'apps/api/pnpm-lock.yaml');
  await writeFile(lock, 'untracked dependency lock\n');
  await assert.rejects(identity(), /Uncommitted governed inputs/);
  await rm(lock);
  await identity();
  const production = 'contracts/src/FundToken.sol';
  await writeFile(join(root, production), `${await readFile(join(root, production), 'utf8')}\n`);
  git('add', production); git('commit', '--quiet', '-m', 'fixture tampering');
  await assert.rejects(identity(), /Frozen production source changed/);
});
