// Offline verifier. Needs archived inputs and the pinned replay code, no RPC.
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { decodeLogs, mean, sd, rawLogBytes } from './common.mjs';
import { digest } from './evidence.mjs';
import { auditPricing } from './audit-pricing.mjs';
import { applyReplayEvent, createReplayState, finalizeNavReferences, normalizedProjection } from '../replay-engine.mjs';

const json = async (p) => JSON.parse(await readFile(p, 'utf8'));
const zipped = async (p) => JSON.parse(gunzipSync(await readFile(p)));
const plain = (v) => JSON.parse(JSON.stringify(v, (_, x) => typeof x === 'bigint' ? x.toString() : x));

async function filesBelow(dir) {
  const paths = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const path = resolve(dir, e.name);
    paths.push(...(e.isDirectory() ? await filesBelow(path) : [path]));
  }
  return paths;
}

export async function verifyRun(dir, { sealed = true } = {}) {
  const allFiles = await filesBelow(dir);
  if (sealed) {
    const manifest = await json(resolve(dir, 'manifest.json'));
    assert.equal(manifest.status, 'complete');
    for (const [path, hash] of Object.entries(manifest.files)) assert.equal(digest(await readFile(resolve(dir, path))), hash, path);
    assert.deepEqual(allFiles.map((p) => relative(dir, p)).filter((p) => p !== 'manifest.json').sort(), Object.keys(manifest.files).sort(), 'Unmanifested files');
  }
  let streams = 0; let events = 0; let checkpoints = 0; let references = 0;
  for (const path of allFiles.filter((p) => /\/(?:scale|case|next-nav|canonical)\/.*\.json\.gz$/.test(p))) {
    const input = await zipped(path);
    const decoded = decodeLogs(input.rawLogs, input.contracts);
    assert.deepEqual(plain(decoded), input.decoded, `${path}: raw/decoded index`);
    const state = createReplayState(input.genesis); const refs = [];
    let cursor = 0;
    for (const cp of input.checkpoints) {
      while (cursor < decoded.length && decoded[cursor].blockNumber <= BigInt(cp.block)) refs.push(...applyReplayEvent(state, decoded[cursor++]));
      assert.deepEqual(normalizedProjection(state), cp.view, `${path}: checkpoint ${cp.block}`);
      checkpoints++;
    }
    while (cursor < decoded.length) refs.push(...applyReplayEvent(state, decoded[cursor++]));
    const finalized = finalizeNavReferences(state, refs);
    assert(finalized.every((r) => r.valid), `${path}: NAV references`);
    assert.deepEqual(normalizedProjection(state), input.finalProjection, `${path}: final projection`);
    if (path.includes('/scale/')) {
      const [target, seed] = relative(resolve(dir, 'scale'), path).split('/')[0].split('-s').map(Number);
      const metrics = await json(resolve(dir, `B-scale-run-${target}-s${seed}.json`));
      assert.equal(metrics.acceptedEvents, decoded.length);
      assert.equal(metrics.transactions, input.operations.length);
      assert.equal(metrics.gas.total, input.operations.reduce((n, op) => n + op.gasUsed, 0));
      assert.equal(metrics.eventIndex.rawPayloadBytes, rawLogBytes(input.rawLogs));
      assert.equal(metrics.eventIndex.normalizedJsonlBytes, Buffer.byteLength(input.normalizedJsonl));
      assert.equal(input.normalizedJsonl, decoded.map((e) => JSON.stringify({ ...e, blockNumber: e.blockNumber.toString() })).join('\n'));
      assert.deepEqual(metrics.latencyMs.replay.samples, input.timingSamplesMs.replay);
      assert.deepEqual(metrics.latencyMs.getLogs.samples, input.timingSamplesMs.getLogs);
      for (const key of ['replay', 'getLogs']) {
        assert.equal(metrics.latencyMs[key].mean, mean(input.timingSamplesMs[key]));
        assert.equal(metrics.latencyMs[key].sd, sd(input.timingSamplesMs[key]));
      }
      assert.equal(metrics.correctness.finalProjectionSha256, digest(JSON.stringify(normalizedProjection(state))));
      assert.deepEqual(metrics.correctness.nri, { valid: finalized.length, total: finalized.length });
      assert.deepEqual(metrics.correctness.pcr, { matched: input.checkpoints.length, checkpoints: input.checkpoints.length });
      for (const nav of state.navHistory) assert.equal(nav.asOf, nav.storedAt, 'NAV clock alignment');
      const tape = gunzipSync(await readFile(resolve(dir, input.chainTape))).toString().trim().split('\n').map(JSON.parse);
      for (const op of input.operations) {
        const tx = tape.find((r) => r.kind === 'transaction' && r.receipt.transactionHash === op.transactionHash);
        assert(tx, 'Missing operation receipt');
        assert.equal(Number(tx.receipt.gasUsed), op.gasUsed);
        assert.equal(tx.receipt.blockNumber, String(op.blockNumber));
        assert.equal(tx.transaction.input, tx.input.data);
      }
      const dump = tape.find((r) => r.kind === 'storage');
      for (const c of input.contracts) {
        const storage = Object.entries(dump.accounts).find(([address]) => address.toLowerCase() === c.address.toLowerCase())?.[1].storage ?? {};
        assert.equal(metrics.storage.nonZeroSlots[c.name], Object.values(storage).filter((v) => BigInt(v) !== 0n).length);
      }
    }
    if (path.includes('/case/')) {
      const summary = await json(resolve(dir, 'C-case-summary.json'));
      const pricing = auditPricing(state, finalized, input.pricingPolicy);
      assert.equal(pricing.filter((r) => r.nextApplicableNavMatches).length, summary.answers.Q1.matchingCasePolicy);
      assert.equal(pricing.length, summary.answers.Q1.total);
      assert.equal(summary.answers.Q6.matched, input.checkpoints.length);
      assert.equal(summary.nri.valid, finalized.length);
      for (const affected of summary.answers.Q2.affected) {
        const record = state.redemptions[Number(affected.requestId)];
        const corrected = state.navHistory[affected.navIndex + 1];
        assert.equal(affected.overpayment, (BigInt(record.redemptionAmount) - BigInt(record.redeemedShares) * BigInt(corrected.nav) / 10n ** 18n).toString());
      }
    }
    streams++; events += decoded.length; references += finalized.length;
  }
  const A = await json(resolve(dir, 'A-scenario-rows.json'));
  assert.equal(A.length, 84); assert(A.every((r) => r.match));
  assert.equal(A.filter((r) => r.comparator === 'B1' && r.class === 'invalid' && r.observed === 'blocked').length, 3);
  assert.equal(A.filter((r) => r.comparator === 'B2' && r.class === 'invalid' && r.observed === 'blocked').length, 13);
  const B = await json(resolve(dir, 'B-scale-summary.json'));
  for (const aggregate of B.aggregate) {
    const runs = await Promise.all(B.runFiles.filter((p) => p.startsWith(`B-scale-run-${aggregate.target}-`)).map((p) => json(resolve(dir, p))));
    assert.equal(runs.length, 3);
    for (const [key, values] of Object.entries({ transactions: runs.map((r) => r.transactions), acceptedEvents: runs.map((r) => r.acceptedEvents),
      gasPerTransaction: runs.map((r) => r.gas.perTransaction), gasPerEvent: runs.map((r) => r.gas.perEvent), storageSlots: runs.map((r) => r.storage.totalNonZeroSlots),
      rawPayloadBytes: runs.map((r) => r.eventIndex.rawPayloadBytes), normalizedJsonlBytes: runs.map((r) => r.eventIndex.normalizedJsonlBytes),
      getLogsMs: runs.map((r) => r.latencyMs.getLogs.mean), replayMs: runs.map((r) => r.latencyMs.replay.mean) })) {
      assert.deepEqual(aggregate[key], { values, mean: mean(values), sd: sd(values) });
    }
  }
  return { status: 'passed', replayStreams: streams, replayedEvents: events, checkedProjections: checkpoints, validNavReferences: references, baselineRows: A.length };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) console.log(JSON.stringify(await verifyRun(resolve(process.argv[2]))));
