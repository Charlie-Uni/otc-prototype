// Offline joins are scoped to one chain and, for snapshot tests, one scenario.
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { account, decodeLogs, lower, viem } from './common.mjs';
import { ROOT, digest } from './evidence.mjs';
import { classifyScenario, summarizeClassifications, replayComparator, recoverComponents,
  gasStatistics, gasTable } from './audit-baselines.mjs';
import { applyReplayEvent, createReplayState, finalizeNavReferences, normalizedProjection } from '../replay-engine.mjs';

const json = async (path) => JSON.parse(await readFile(path, 'utf8'));
const zipped = async (path) => JSON.parse(gunzipSync(await readFile(path)));
const plain = (value) => JSON.parse(JSON.stringify(value, (_, x) => typeof x === 'bigint' ? x.toString() : x));
const contractName = (kind) => kind === 'B1' ? 'B1TokenOnly' : 'B2PermissionedAllowlist';
const ISSUER_ROLE = viem.keccak256(viem.stringToHex('ISSUER_ROLE'));
// These are the preserved measurement fixture's public test-account positions.
const actors = { alice: lower(account(3).address), bob: lower(account(4).address),
  operator2: lower(account(5).address), issuerRole: ISSUER_ROLE };
const canonicalTypes = ['qualification', 'qualification', 'navSubmission', 'subscriptionRequest', 'subscription',
  'transfer', 'navSubmission', 'redemptionRequest', 'settlementDelay', 'redemption',
  'pauseResume', 'pauseResume', 'roleUpdate', 'roleUpdate'];
const canonicalCalls = ['setAllowlisted', 'setAllowlisted', null, null, 'mint', 'transfer', null, null, null,
  'burn', 'pause', 'unpause', 'grantRole', 'revokeRole'];

async function comparatorTape(dir, port, kind) {
  const matches = [];
  for (const name of (await readdir(resolve(dir, 'chains'))).filter((p) => p.startsWith(`${port}-`))) {
    const bytes = await readFile(resolve(dir, 'chains', name));
    const records = gunzipSync(bytes).toString().trim().split('\n').map(JSON.parse);
    if (records.some((r) => r.kind === 'transaction' && r.input.deployment === contractName(kind))) {
      assert.equal(records[0].port, port, 'Chain port');
      matches.push({ path: `chains/${name}`, records });
    }
  }
  assert.equal(matches.length, 1, `Unique ${kind} chain at port ${port}`);
  return matches[0];
}

export function checkTransaction(record) {
  assert.equal(record.kind, 'transaction');
  const { transaction: tx, receipt, input } = record;
  assert.equal(receipt.status, 'success', 'Successful receipt');
  assert.equal(tx.hash, receipt.transactionHash, 'Envelope/receipt hash');
  assert.equal(BigInt(tx.blockNumber), BigInt(receipt.blockNumber), 'Envelope/receipt block');
  if (input.data) assert.equal(tx.input, input.data, 'Envelope/call data');
  return Number(receipt.gasUsed);
}

function logIdentity(log) {
  return { address: lower(log.address), topics: log.topics.map(lower), data: lower(log.data),
    blockNumber: String(BigInt(log.blockNumber)), transactionHash: lower(log.transactionHash),
    logIndex: Number(log.logIndex) };
}

function checkReceiptLogs(rawLogs, transactions) {
  const fromReceipts = transactions.flatMap((tx) => tx.receipt.logs);
  assert.deepEqual(rawLogs.map(logIdentity), fromReceipts.map(logIdentity), 'Raw logs / receipt logs');
}

function scenarioSegments(records) {
  const segments = new Map(); let current;
  for (const record of records) {
    if (record.kind === 'scenario') {
      assert(!current && !segments.has(record.id), 'Duplicate or nested scenario');
      current = { marker: record, records: [] }; segments.set(record.id, current);
    } else if (record.kind === 'snapshot-revert') {
      assert.equal(record.scenario, current?.marker.id, 'Snapshot boundary'); current = null;
    } else if (current) current.records.push(record);
  }
  assert.equal(current, null, 'Unclosed scenario');
  return segments;
}

function observedState(state, kind) {
  const value = { totalSupply: String(state.totalSupply), alice: String(state.balances[actors.alice] ?? 0n),
    bob: String(state.balances[actors.bob] ?? 0n) };
  if (kind === 'B2') Object.assign(value, { allowAlice: Boolean(state.allowlist[actors.alice]),
    allowBob: Boolean(state.allowlist[actors.bob]), paused: state.paused, operator2Issuer: state.operator2Issuer });
  return value;
}

function verifyScenarioRecord(row, segment, contracts, represented) {
  assert.equal(segment.marker.comparator, row.comparator);
  const records = segment.records.filter((r) => ['transaction', 'simulated-rejection'].includes(r.kind));
  const action = represented ? records.at(-1) : null;
  const replay = replayComparator(row.comparator, actors);
  const apply = (record) => {
    checkTransaction(record);
    for (const event of decodeLogs(record.receipt.logs, contracts)) replay.apply(event);
  };
  for (const record of represented ? records.slice(0, -1) : records) apply(record);
  if (!represented) return;
  assert(action, `Missing action ${row.id}`);
  assert.deepEqual(observedState(replay.snapshot(), row.comparator), row.before, `${row.id}: before state`);
  assert.equal(row.call.split(' by ')[0], action.input.functionName, 'Executed function');
  assert.equal(action.input.data, viem.encodeFunctionData({ abi: contracts[0].abi,
    functionName: action.input.functionName, args: action.input.args }), 'Encoded action');
  if (action.kind === 'simulated-rejection') {
    assert.equal(row.status, 'rejected'); assert.equal(row.stage, action.stage);
    assert.equal(row.reason, action.reason); assert.equal(row.transactionHash, null);
    assert.equal(row.logsWritten, 0);
    assert.match(action.error.message, /execution reverted/i, 'Positive archived EVM revert');
  } else {
    assert.equal(row.status, 'accepted'); assert.equal(row.transactionHash, action.receipt.transactionHash);
    assert.equal(row.logsWritten, action.receipt.logs.length); apply(action);
  }
  assert.deepEqual(observedState(replay.snapshot(), row.comparator), row.after, `${row.id}: after state`);
}

export async function verifyClassifications(dir, rows, summary) {
  const specDir = resolve(ROOT, 'experiments/paper85-evaluation');
  const mapping = await json(resolve(specDir, 'spec-v3/baseline-mapping.v3.json'));
  const spec = await json(resolve(specDir, 'spec/scenarios.v1.json'));
  const recomputed = []; const sources = [];
  for (const [kind, port] of [['B1', 18645], ['B2', 18646]]) {
    const tape = await comparatorTape(dir, port, kind); sources.push(tape.path);
    const segments = scenarioSegments(tape.records);
    const art = await json(resolve(dir, `build/${contractName(kind)}.artifact.json`));
    const deployment = tape.records.find((r) => r.input?.deployment === contractName(kind));
    const contracts = [{ name: contractName(kind), address: deployment.receipt.contractAddress, abi: art.abi }];
    assert.equal(segments.size, mapping.scenarios.length, 'Scenario segments');
    const mine = rows.filter((row) => row.comparator === kind);
    assert.equal(mine.length, mapping.scenarios.length, 'Scenario rows');
    assert.equal(new Set(mine.map((row) => row.id)).size, mine.length, 'Duplicate scenario row');
    for (const planned of mapping.scenarios) {
      const row = mine.find((r) => r.id === planned.id); assert(row, `Missing ${kind}:${planned.id}`);
      const scenario = spec.scenarios.find((s) => s.id === row.id); assert(scenario, 'Unknown scenario');
      assert.equal(row.class, row.id.startsWith('V') ? 'valid' : 'invalid');
      assert.equal(row.targetPredicate, scenario.targetPredicate ?? null);
      assert.equal(segments.get(row.id).marker.fixture, scenario.fixture);
      const represented = planned[kind].action !== null;
      verifyScenarioRecord(row, segments.get(row.id), contracts, represented);
      const observed = classifyScenario(row, represented);
      assert.equal(row.observed, observed, `${kind}:${row.id}: classification`);
      assert.equal(row.expected, planned[kind].expected, 'Preserved expected classification');
      assert.equal(row.match, observed === row.expected, 'Classification match flag');
      assert(row.match, `Mapping mismatch ${kind}:${row.id}`);
      recomputed.push({ ...row, observed });
    }
  }
  assert.equal(rows.length, recomputed.length, 'Unknown comparator rows');
  const result = summarizeClassifications(recomputed);
  assert.deepEqual(result.totals, summary.totals, 'Table 8 totals');
  assert.deepEqual(result.byPredicate, summary.byPredicate, 'Table 8 predicate breakdown');
  assert.deepEqual(summary.preregisteredTotals, mapping.expectedTotals);
  assert.equal(summary.allRowsMatchPreregistration, true);
  return { ...result, rows: rows.length, executedRows: rows.filter((r) => r.status).length, sources,
    limits: 'Capability absence uses the preserved action:null mapping; business equivalence of mapped actions is not independently established.' };
}

export async function verifyTrajectory(dir, kind, port) {
  const path = `trajectories/${kind}-${port}.json`; const input = await json(resolve(dir, path));
  const tape = await comparatorTape(dir, port, kind);
  const transactions = tape.records.filter((r) => r.kind === 'transaction');
  transactions.forEach(checkTransaction);
  const boot = input.deployReceipts;
  assert.deepEqual(boot, transactions.slice(0, boot.length).map((r) => r.receipt), 'Deployment receipts');
  const calls = transactions.slice(boot.length);
  assert.equal(input.steps.length, canonicalTypes.length, 'Canonical operation count');
  for (const [index, step] of input.steps.entries()) {
    assert.equal(step.id, `O${String(index + 1).padStart(2, '0')}`, 'Canonical operation order');
    assert.equal(step.opType, canonicalTypes[index], 'Canonical operation category');
    const expectedCall = kind === 'B1' && !['mint', 'transfer', 'burn'].includes(canonicalCalls[index])
      ? null : canonicalCalls[index];
    assert.equal(step.represented, expectedCall !== null, 'Canonical capability');
    assert.equal(step.call ?? null, expectedCall, 'Canonical counterpart call');
  }
  assert.equal(calls.length, input.steps.filter((step) => step.represented).length, 'Trajectory calls');
  for (const step of input.steps.filter((s) => s.represented)) {
    const matches = calls.filter((r) => r.receipt.blockNumber === String(step.blockNumber));
    assert.equal(matches.length, 1, 'Unique chain-scoped step receipt');
    assert.equal(step.call, matches[0].input.functionName, 'Trajectory function');
    assert.equal(step.gasUsed, Number(matches[0].receipt.gasUsed), 'Trajectory receipt gas');
  }
  checkReceiptLogs(input.rawLogs, calls);
  const events = decodeLogs(input.rawLogs, input.contracts);
  assert.deepEqual(plain(events), input.decoded, 'Comparator raw/decoded index');
  return { input, events, calls, boot, sources: [path, tape.path] };
}

export async function verifyRecoverability(dir, summary) {
  const input = await zipped(resolve(dir, 'canonical/18660.json.gz'));
  const events = decodeLogs(input.rawLogs, input.contracts);
  const state = createReplayState(input.genesis); const refs = []; const projections = []; let cursor = 0;
  for (const checkpoint of input.checkpoints) {
    while (cursor < events.length && events[cursor].blockNumber <= BigInt(checkpoint.block)) {
      refs.push(...applyReplayEvent(state, events[cursor++]));
    }
    const projection = normalizedProjection(state);
    assert.deepEqual(projection, checkpoint.view, 'Production recoverability checkpoint'); projections.push(projection);
  }
  assert.equal(cursor, events.length, 'Unassigned production events');
  assert(finalizeNavReferences(state, refs).every((ref) => ref.valid));
  const candidate = input.genesis.roles.find((role) => role.contractName === 'FundToken' && !role.enabled);
  assert(candidate, 'Declared candidate role');
  const names = { ...actors, production: { alice: input.genesis.actors[2], bob: input.genesis.actors[3],
    roleKey: `FundToken:${candidate.role}:${candidate.account}` } };
  const result = { productionAcceptedEvents: events.length,
    productionEventTypes: {}, productionNavReferences: refs.length, comparators: {} };
  for (const event of events) {
    result.productionEventTypes[event.eventName] = (result.productionEventTypes[event.eventName] ?? 0) + 1;
  }
  const sources = ['canonical/18660.json.gz'];
  for (const [kind, port] of [['B1', 18670], ['B2', 18671]]) {
    const run = await verifyTrajectory(dir, kind, port); sources.push(...run.sources);
    result.comparators[kind] = {
      representedOperations: run.input.steps.filter((s) => s.represented).length, totalOperations: run.input.steps.length,
      eventsWritten: run.events.length, eventTypes: [...new Set(run.events.map((e) => e.eventName))],
      components: recoverComponents(kind, run.events, run.input.steps, projections, names),
      navReferencesRecorded: 0, navReferencesRequired: refs.length,
    };
  }
  assert.deepEqual(result, summary, 'Table 9 recoverability');
  return { ...result, productionCheckpoints: projections.length, sources,
    assumptions: 'Preserved fixture account positions and empty post-deployment comparator ledger; ' +
      'candidate role correspondence is limited to issuance/subscription.' };
}

export async function verifyGas(dir, summary) {
  const production = {}; const sources = []; let receipts = 0;
  assert.equal(summary.productionGas.repetitions, 5);
  assert.equal(summary.productionGas.samples.length, 5);
  for (let index = 0; index < 5; index++) {
    const path = `chains/canonical-${19100 + index}.jsonl.gz`; sources.push(path);
    const tape = gunzipSync(await readFile(resolve(dir, path))).toString().trim().split('\n').map(JSON.parse);
    const transactions = tape.filter((r) => r.kind === 'transaction'); transactions.forEach(checkTransaction);
    const samples = summary.productionGas.samples[index]; assert.equal(samples.length, 14);
    assert.deepEqual(transactions.filter((tx) => tx.input.label.startsWith('deploy ')).map((tx) => Number(tx.receipt.gasUsed)),
      summary.productionGas.deploymentGas, 'Production deployment gas');
    for (const [position, sample] of samples.entries()) {
      assert.equal(sample.operationId, `O${String(position + 1).padStart(2, '0')}`);
      const matches = transactions.filter((r) => r.receipt.transactionHash === sample.transactionHash);
      assert.equal(matches.length, 1, 'Production receipt'); const tx = matches[0];
      assert.equal(tx.input.label, sample.label); assert.equal(tx.receipt.blockNumber, sample.blockNumber);
      const gas = Number(tx.receipt.gasUsed); assert.equal(gas, Number(sample.gasUsed), 'Production receipt gas');
      (production[sample.operationId] ??= []).push(gas); receipts++;
    }
  }
  const operations = Object.fromEntries(Object.entries(production).map(([id, values]) => {
    const stats = gasStatistics(values); return [id, { samples: values, meanGas: stats.meanGas, sdGas: stats.sdGas }];
  }));
  assert.deepEqual(operations, summary.productionGas.operations, 'Production gas aggregates');
  const comparators = {};
  for (const kind of ['B1', 'B2']) {
    const values = {}; const deploymentRuns = [];
    for (let index = 0; index < 5; index++) {
      const run = await verifyTrajectory(dir, kind, 18680 + index); sources.push(...run.sources);
      deploymentRuns.push(run.boot.map((receipt) => Number(receipt.gasUsed)));
      for (const step of run.input.steps.filter((s) => s.represented)) {
        (values[step.opType] ??= []).push(step.gasUsed); receipts++;
      }
    }
    const art = await json(resolve(dir, `build/${contractName(kind)}.artifact.json`));
    comparators[kind] = { repetitions: 5, deploymentGas: deploymentRuns[0],
      deploymentGasIdenticalAcrossRuns: deploymentRuns.every((run) => JSON.stringify(run) === JSON.stringify(deploymentRuns[0])),
      deployedRuntimeBytes: (art.deployedBytecode.object.length - 2) / 2,
      operations: Object.fromEntries(Object.entries(values).map(([type, gas]) => [type, gasStatistics(gas)])) };
    assert.deepEqual(comparators[kind], summary.comparatorGas[kind], `${kind} gas aggregates`);
  }
  return { production: operations, comparators, table: gasTable(operations, comparators),
    operationReceipts: receipts, freshTrajectories: 15, sources };
}

export async function verifyBaselines(dir) {
  const summary = await json(resolve(dir, 'A-summary.json'));
  const rowsPath = resolve(dir, 'A-scenario-rows.json'); const rows = await json(rowsPath);
  assert.equal(summary.rowsSha256, digest(await readFile(rowsPath)), 'Scenario row checksum');
  return { table8: await verifyClassifications(dir, rows, summary.scenarioComparison),
    table9: await verifyRecoverability(dir, summary.recoverability), table10: await verifyGas(dir, summary) };
}
