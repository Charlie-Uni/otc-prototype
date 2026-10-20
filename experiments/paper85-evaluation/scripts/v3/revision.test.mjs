import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { auditPricing } from './audit-pricing.mjs';
import { assertBuild } from './build.mjs';
import { ROOT, assertRuntime, sourceIdentity } from './evidence.mjs';
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
  const p = { correctionIndices: [0], suspensions: [{ from: 8, resume: 30 }] };
  assert.equal(pricing([nav(5, 20), nav(30)], 1, order, p).nextApplicableNavMatches, true);
});

const abi = [{ type: 'function', name: 'f', stateMutability: 'nonpayable', inputs: [], outputs: [] }];
const options = (error) => ({ client: { call: async () => { throw error; } }, wallet: { account: { address: `0x${'1'.repeat(40)}` } },
  contract: { address: `0x${'2'.repeat(40)}`, abi }, functionName: 'f' });
test('transport, timeout and non-revert RPC failures abort instead of becoming blocked observations', async () => {
  for (const error of [new Error('ECONNRESET'), new Error('request timeout'), Object.assign(new Error('invalid params'), { code: -32602 }),
    Object.assign(new Error('rate limited'), { code: 429 })]) await assert.rejects(tryWrite(options(error)), (e) => e === error);
  await assert.rejects(tryWrite({ ...options(new Error('unreachable')), functionName: 'missing' }));
});
test('positive EVM execution-reverted signal counts only as a simulated rejection', async () => {
  const error = Object.assign(new Error('execution reverted: PAUSED'), { code: 3 });
  const result = await tryWrite(options(error));
  assert.equal(result.status, 'rejected'); assert.equal(result.stage, 'eth_call');
  assert.equal(result.receipt, undefined);
  const typed = new viem.ExecutionRevertedError({ message: 'execution reverted' });
  assert.equal((await tryWrite(options(typed))).status, 'rejected');
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
test('governed input guard covers runner, compiler config and dependency lock', async () => {
  await sourceIdentity();
  for (const path of ['experiments/paper85-evaluation/scripts/v3/run-scale.mjs', 'contracts/foundry.toml', 'pnpm-lock.yaml']) {
    const absolute = resolve(ROOT, path); const original = await readFile(absolute);
    try {
      await writeFile(absolute, Buffer.concat([original, Buffer.from('\n')]));
      await assert.rejects(sourceIdentity(), /Uncommitted governed inputs/);
    } finally { await writeFile(absolute, original); }
  }
  await sourceIdentity();
});
