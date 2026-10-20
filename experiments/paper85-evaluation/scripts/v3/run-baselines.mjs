// Part A of the v3 pre-registration: B1/B2 comparators.
//   A1 scenario comparison against spec-v3/baseline-mapping.v3.json
//   A2 component-level recoverability on the canonical 14-operation trajectory
//   A3 receipt gas of comparator counterpart operations (5 fresh deployments)
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { assertRuntime, record, recordReceipt, save } from './evidence.mjs';
import {
  E18, EVAL_DIR, GENESIS_TIMESTAMP, RESULTS_DIR,
  account, artifact, decodeLogs, deploy, gitHead, invariant, lower, mean, mustWrite, sd,
  sha256File, startAnvil, toolVersions, tryWrite, viem, writeJson,
} from './common.mjs';
import { replayComparator } from './audit-baselines.mjs';
import { startReplayScenario } from '../replay-chain.mjs';
import { applyReplayEvent, createReplayState, normalizedProjection } from '../replay-engine.mjs';

const { keccak256, stringToHex, toHex } = viem;
const MAPPING_PATH = resolve(EVAL_DIR, 'spec-v3/baseline-mapping.v3.json');
const PLAN_PATH = resolve(EVAL_DIR, 'spec-v3/evaluation-plan.v3.md');
const ISSUER_ROLE = keccak256(stringToHex('ISSUER_ROLE'));
const COMPLIANCE_ROLE = keccak256(stringToHex('COMPLIANCE_ROLE'));
const PAUSER_ROLE = keccak256(stringToHex('PAUSER_ROLE'));

const ACTOR_INDEX = { admin: 0, issuer: 1, pauser: 2, alice: 3, bob: 4, operator2: 5, transferOperator: 6, stranger: 7 };
const actors = Object.fromEntries(Object.entries(ACTOR_INDEX).map(([k, i]) => [k, account(i)]));

// ---------------------------------------------------------------------------
// Deployment and fixtures (business-equivalent states, see fixtureMapping)
// ---------------------------------------------------------------------------
async function deployComparator(env, kind) {
  const art = await artifact(kind === 'B1' ? 'B1TokenOnly' : 'B2PermissionedAllowlist', { baseline: true });
  const admin = env.walletFor(actors.admin);
  const token = await deploy({ client: env.client, wallet: admin, art, args: [actors.admin.address] });
  const receipts = [token.receipt];
  if (kind === 'B2') {
    for (const [role, who] of [[ISSUER_ROLE, actors.issuer], [COMPLIANCE_ROLE, actors.admin], [PAUSER_ROLE, actors.pauser]]) {
      receipts.push(await mustWrite({ client: env.client, wallet: admin, contract: token, functionName: 'grantRole', args: [role, who.address] }));
    }
  }
  return { token, receipts };
}

function issuerOf(kind) {
  return kind === 'B1' ? actors.admin : actors.issuer;
}

async function call(env, contract, who, functionName, args = []) {
  return tryWrite({ client: env.client, wallet: env.walletFor(actors[who] ?? who), contract, functionName, args });
}

const FIXTURES = {
  bare: [],
  eligible: [['allow', 'alice', true]],
  initial_nav: [],
  eligible_initial_nav: ['eligible'],
  pending_subscription: ['eligible'],
  pending_subscription_no_nav: ['eligible'],
  tiny_pending_subscription: ['eligible'],
  funded_alice: ['eligible', ['mint', 'alice', 100n * E18]],
  funded_alice_bob: ['funded_alice', ['allow', 'bob', true], ['transfer', 'alice', 'bob', 20n * E18]],
  pending_redemption: ['funded_alice'],
  queued_alice: ['funded_alice', ['allow', 'bob', true]],
  settled_redemption: ['funded_alice', ['burn', 'alice', 20n * E18]],
  paused_funded: ['funded_alice_bob', ['pause']],
  revoked_funded_alice: ['funded_alice', ['allow', 'alice', false]],
  revoked_pending_subscription: ['eligible', ['allow', 'alice', false]],
  allowanced_paused_funded: ['funded_alice_bob', ['approve', 'alice', 'transferOperator', 10n * E18], ['pause']],
  paused_pending_subscription: ['eligible', ['pause']],
  paused_pending_redemption: ['funded_alice', ['pause']],
  role_granted_operator2: [['grantIssuer', 'operator2']],
  nav_history: [],
};

async function applyStep(env, kind, token, step) {
  const issuer = issuerOf(kind);
  const [op, ...rest] = step;
  let result;
  if (op === 'allow') {
    if (kind === 'B1') return; // no on-chain eligibility
    result = await call(env, token, 'admin', 'setAllowlisted', [actors[rest[0]].address, rest[1]]);
  } else if (op === 'mint') {
    result = await call(env, token, issuer, 'mint', [actors[rest[0]].address, rest[1]]);
  } else if (op === 'burn') {
    result = await call(env, token, issuer, 'burn', [actors[rest[0]].address, rest[1]]);
  } else if (op === 'transfer') {
    result = await call(env, token, rest[0], 'transfer', [actors[rest[1]].address, rest[2]]);
  } else if (op === 'approve') {
    result = await call(env, token, rest[0], 'approve', [actors[rest[1]].address, rest[2]]);
  } else if (op === 'pause') {
    if (kind === 'B1') return; // no on-chain operating status
    result = await call(env, token, 'pauser', 'pause');
  } else if (op === 'grantIssuer') {
    if (kind === 'B1') return; // single owner, no delegable issuance role
    result = await call(env, token, 'admin', 'grantRole', [ISSUER_ROLE, actors[rest[0]].address]);
  } else {
    throw new Error(`unknown fixture step ${op}`);
  }
  invariant(result.status === 'accepted', `fixture step ${op} rejected: ${result.reason}`);
}

async function buildFixture(env, kind, token, name) {
  for (const step of FIXTURES[name]) {
    if (typeof step === 'string') await buildFixture(env, kind, token, step);
    else await applyStep(env, kind, token, step);
  }
}

// Scenario actions (business equivalents of baseline-mapping.v3.json prose).
// null = not representable on this comparator.
function scenarioAction(id, kind) {
  const issuer = kind === 'B1' ? 'admin' : 'issuer';
  const onlyB2 = (action) => (kind === 'B2' ? action : null);
  const table = {
    V01: onlyB2(['admin', 'setAllowlisted', ['alice', true]]),
    V02: onlyB2(['admin', 'setAllowlisted', ['alice', false]]),
    V08: [issuer, 'mint', ['alice', 100n * E18]],
    V09: ['bob', 'transfer', ['alice', 5n * E18]],
    V13: [issuer, 'burn', ['alice', 20n * E18]],
    V14: onlyB2(['pauser', 'pause', []]),
    V15: onlyB2(['pauser', 'unpause', []]),
    V16: onlyB2(['admin', 'grantRole', [ISSUER_ROLE, 'operator2']]),
    V17: onlyB2(['admin', 'revokeRole', [ISSUER_ROLE, 'operator2']]),
    I01: onlyB2(['stranger', 'setAllowlisted', ['alice', true]]),
    I03: ['stranger', 'mint', ['alice', 100n * E18]],
    I04: ['stranger', 'burn', ['alice', 20n * E18]],
    I05: onlyB2(['stranger', 'grantRole', [ISSUER_ROLE, 'operator2']]),
    I06: [issuer, 'mint', ['alice', 100n * E18]],
    I07: [issuer, 'mint', ['alice', 100n * E18]],
    I08: ['alice', 'transfer', ['bob', 20n * E18]],
    I09: [issuer, 'burn', ['alice', 20n * E18]],
    I10: [issuer, 'mint', ['alice', 100n * E18]],
    I14: ['alice', 'transfer', ['bob', 5n * E18]],
    I15: [issuer, 'mint', ['alice', 100n * E18]],
    I16: [issuer, 'burn', ['alice', 20n * E18]],
    I17: ['transferOperator', 'transferFrom', ['alice', 'bob', 5n * E18]],
    I18: [issuer, 'mint', ['alice', 0n]],
    I19: [issuer, 'mint', ['alice', 0n]],
    I20: [issuer, 'mint', ['alice', 100n * E18]],
    I21: [issuer, 'burn', ['alice', 0n]],
    I22: [issuer, 'burn', ['alice', 100n * E18 + 1n]],
    I23: ['alice', 'transfer', ['bob', 20n * E18 + 1n]],
    I24: [issuer, 'burn', ['alice', 20n * E18]],
  };
  return table[id] ?? null;
}

function resolveArgs(args) {
  return args.map((value) => (typeof value === 'string' && actors[value] ? actors[value].address : value));
}

async function observeState(env, kind, token) {
  const read = (fn, args = []) => env.client.readContract({ address: token.address, abi: token.abi, functionName: fn, args });
  const state = {
    totalSupply: (await read('totalSupply')).toString(),
    alice: (await read('balanceOf', [actors.alice.address])).toString(),
    bob: (await read('balanceOf', [actors.bob.address])).toString(),
  };
  if (kind === 'B2') {
    state.allowAlice = await read('allowlisted', [actors.alice.address]);
    state.allowBob = await read('allowlisted', [actors.bob.address]);
    state.paused = await read('paused');
    state.operator2Issuer = await read('hasRole', [ISSUER_ROLE, actors.operator2.address]);
  }
  return state;
}

async function runScenarioComparison(mapping, sealed) {
  const fixtureOf = Object.fromEntries(sealed.scenarios.map((s) => [s.id, s.fixture]));
  const rows = [];
  for (const kind of ['B1', 'B2']) {
    const env = await startAnvil(18645 + (kind === 'B1' ? 0 : 1));
    try {
      const { token } = await deployComparator(env, kind);
      let snap = await env.client.request({ method: 'evm_snapshot', params: [] });
      for (const scenario of mapping.scenarios) {
        await record(env.client, { kind: 'scenario', id: scenario.id, comparator: kind, fixture: fixtureOf[scenario.id] });
        const expected = scenario[kind].expected;
        const valid = scenario.id.startsWith('V');
        await buildFixture(env, kind, token, fixtureOf[scenario.id]);
        const action = scenarioAction(scenario.id, kind);
        let observed;
        let detail = {};
        if (action === null) {
          observed = 'not_representable';
        } else {
          const [who, fn, args] = action;
          const before = await observeState(env, kind, token);
          const result = await call(env, token, who, fn, resolveArgs(args));
          const after = await observeState(env, kind, token);
          const ledgerChanged = ['totalSupply', 'alice', 'bob'].some((k) => before[k] !== after[k]);
          if (result.status === 'rejected') observed = 'blocked';
          else if (valid) observed = 'represented_accept';
          else observed = ledgerChanged ? 'accepted_state_change' : 'accepted_no_state_change';
          const logs = result.receipt ? result.receipt.logs.length : 0;
          detail = { call: `${fn} by ${who}`, status: result.status, stage: result.stage ?? 'mined', reason: result.reason ?? null, transactionHash: result.receipt?.transactionHash ?? null, ledgerChanged, logsWritten: logs, before, after };
        }
        rows.push({ comparator: kind, id: scenario.id, class: valid ? 'valid' : 'invalid', targetPredicate: sealed.scenarios.find((s) => s.id === scenario.id).targetPredicate ?? null, expected, observed, match: expected === observed, ...detail });
        await env.client.request({ method: 'evm_revert', params: [snap] });
        await record(env.client, { kind: 'snapshot-revert', scenario: scenario.id, snapshot: snap });
        snap = await env.client.request({ method: 'evm_snapshot', params: [] });
      }
    } finally {
      await env.stop();
    }
  }
  const totals = {};
  for (const kind of ['B1', 'B2']) {
    const mine = rows.filter((r) => r.comparator === kind);
    const count = (cls, obs) => mine.filter((r) => r.class === cls && r.observed === obs).length;
    totals[kind] = {
      validRepresented: count('valid', 'represented_accept'),
      validNotRepresentable: count('valid', 'not_representable'),
      validRejected: count('valid', 'blocked'),
      invalidBlocked: count('invalid', 'blocked'),
      invalidAcceptedStateChange: count('invalid', 'accepted_state_change'),
      invalidAcceptedNoStateChange: count('invalid', 'accepted_no_state_change'),
      invalidNotRepresentable: count('invalid', 'not_representable'),
      expectedMatches: mine.filter((r) => r.match).length,
      rows: mine.length,
    };
  }
  // Per-predicate breakdown of invalid rows
  const byPredicate = {};
  for (const r of rows.filter((x) => x.class === 'invalid')) {
    byPredicate[r.targetPredicate] ??= { scenarios: 0, B1: {}, B2: {} };
    if (r.comparator === 'B1') byPredicate[r.targetPredicate].scenarios += 1;
    byPredicate[r.targetPredicate][r.comparator][r.observed] = (byPredicate[r.targetPredicate][r.comparator][r.observed] ?? 0) + 1;
  }
  return { rows, totals, byPredicate, preregisteredTotals: mapping.expectedTotals };
}

// ---------------------------------------------------------------------------
// A2 + A3: canonical trajectory on comparators
// ---------------------------------------------------------------------------
// Canonical v2.1 trajectory O01-O14 and comparator counterparts.
function trajectory(kind) {
  const issuer = kind === 'B1' ? 'admin' : 'issuer';
  const b2 = (x) => (kind === 'B2' ? x : null);
  return [
    ['O01', 'qualification', b2(['admin', 'setAllowlisted', ['alice', true]])],
    ['O02', 'qualification', b2(['admin', 'setAllowlisted', ['bob', true]])],
    ['O03', 'navSubmission', null],
    ['O04', 'subscriptionRequest', null],
    ['O05', 'subscription', [issuer, 'mint', ['alice', 100n * E18]]],
    ['O06', 'transfer', ['alice', 'transfer', ['bob', 20n * E18]]],
    ['O07', 'navSubmission', null],
    ['O08', 'redemptionRequest', null],
    ['O09', 'settlementDelay', null],
    ['O10', 'redemption', [issuer, 'burn', ['bob', 10n * E18]]],
    ['O11', 'pauseResume', b2(['pauser', 'pause', []])],
    ['O12', 'pauseResume', b2(['pauser', 'unpause', []])],
    ['O13', 'roleUpdate', b2(['admin', 'grantRole', [ISSUER_ROLE, 'operator2']])],
    ['O14', 'roleUpdate', b2(['admin', 'revokeRole', [ISSUER_ROLE, 'operator2']])],
  ];
}

async function runComparatorTrajectory(kind, port) {
  const env = await startAnvil(port);
  try {
    const { token, receipts: deployReceipts } = await deployComparator(env, kind);
    const steps = [];
    for (const [id, opType, action] of trajectory(kind)) {
      if (action === null) { steps.push({ id, opType, represented: false }); continue; }
      const [who, fn, args] = action;
      const result = await call(env, token, who, fn, resolveArgs(args));
      invariant(result.status === 'accepted', `${kind} ${id} rejected: ${result.reason}`);
      steps.push({ id, opType, represented: true, call: fn, gasUsed: Number(result.receipt.gasUsed), blockNumber: result.receipt.blockNumber });
    }
    const fromBlock = deployReceipts.at(-1).blockNumber + 1n;
    const raw = await env.client.request({ method: 'eth_getLogs', params: [{ address: [token.address], fromBlock: toHex(fromBlock), toBlock: 'latest' }] });
    const decoded = decodeLogs(raw, [token]);
    await save(resolve(RESULTS_DIR, 'trajectories', `${kind}-${port}.json`), { steps, contracts: [{ name: token.name, address: token.address, abi: token.abi }], rawLogs: raw, decoded, deployReceipts });
    return { steps, decoded, deployGas: deployReceipts.map((r) => Number(r.gasUsed)), deployedSize: (await artifact(token.name, { baseline: true })).deployedSize };
  } finally {
    await env.stop();
  }
}

async function productionCheckpointProjections(port = 18660) {
  const scenario = await startReplayScenario(port, { observeClient: async (client) => {
    client.evidencePath = resolve(RESULTS_DIR, `chains/canonical-${port}.jsonl`);
    client.onReceipt = async (receipt, input) => {
      await recordReceipt(client, receipt, input);
      if (receipt.contractAddress) {
        const art = await artifact(input.label.replace('deploy ', ''));
        const runtime = await client.getCode({ address: receipt.contractAddress });
        assertRuntime(runtime, art);
        await record(client, { kind: 'deployment-runtime', name: art.name, address: receipt.contractAddress, runtime });
      }
    };
  } });
  try {
    scenario.markReplayComplete();
    const nameOf = new Map([
      [lower(account(0).address), 'admin'], [lower(account(1).address), 'manager'], [lower(account(2).address), 'alice'],
      [lower(account(3).address), 'bob'], [lower(account(4).address), 'operator2'],
    ]);
    const projections = [];
    for (const checkpoint of scenario.checkpoints) {
      const p = await scenario.readProjection(checkpoint.blockNumber);
      projections.push({ id: checkpoint.operationId, projection: p, named: Object.fromEntries(Object.entries(p.balances).map(([addr, v]) => [nameOf.get(addr), v])), whitelistNamed: Object.fromEntries(Object.entries(p.whitelist).map(([addr, v]) => [nameOf.get(addr), v])), operator2Subscription: Object.entries(p.roles).find(([k]) => k.startsWith('FundToken:') && k.endsWith(lower(account(4).address)))?.[1] ?? false });
    }
    // Recompute replay ARC/NRI/PCR on the production stream for reference.
    const state = createReplayState(scenario.genesis);
    let navRefs = 0;
    for (const event of scenario.rawLogs) navRefs += applyReplayEvent(state, event).length;
    await save(resolve(RESULTS_DIR, `canonical/${port}.json.gz`), { genesis: scenario.genesis, rawLogs: scenario.rawRpcLogs,
      contracts: Object.entries(scenario.contracts).map(([key, c]) => ({ ...c, name: { fundToken: 'FundToken', navRegistry: 'NAVRegistry', riskRegistry: 'RiskRegistry' }[key] })),
      decoded: scenario.rawLogs, checkpoints: projections.map((p, i) => ({ block: scenario.checkpoints[i].blockNumber, view: p.projection })), finalProjection: normalizedProjection(state) });
    const eventTypes = {};
    for (const event of scenario.rawLogs) eventTypes[event.eventName] = (eventTypes[event.eventName] ?? 0) + 1;
    return { projections, checkpoints: scenario.checkpoints, deploymentGas: scenario.bootstrapReceipts.slice(0, 3).map((r) => Number(r.gasUsed)), acceptedEvents: scenario.rawLogs.length, eventTypes, navReferences: navRefs, finalProjection: normalizedProjection(state) };
  } finally {
    await scenario.close();
  }
}

async function runRecoverability() {
  const production = await productionCheckpointProjections();
  const result = { productionAcceptedEvents: production.acceptedEvents, productionEventTypes: production.eventTypes, productionNavReferences: production.navReferences, comparators: {} };
  for (const [kind, port] of [['B1', 18670], ['B2', 18671]]) {
    const run = await runComparatorTrajectory(kind, port);
    const replay = replayComparator(kind, { issuerRole: ISSUER_ROLE, operator2: actors.operator2.address });
    // Walk checkpoints: after each canonical operation, apply logs of that block.
    const byBlock = new Map();
    for (const e of run.decoded) {
      const key = e.blockNumber.toString();
      if (!byBlock.has(key)) byBlock.set(key, []);
      byBlock.get(key).push(e);
    }
    const nameAddr = { alice: lower(actors.alice.address), bob: lower(actors.bob.address) };
    const components = { balances: [], eligibility: [], navHistory: [], operatingStatus: [], executionRoles: [], requestRecords: [], completeProjection: [], completeProjectionValueEquality: [] };
    run.steps.forEach((step, i) => {
      if (step.represented) for (const e of byBlock.get(step.blockNumber.toString()) ?? []) replay.apply(e);
      const s = replay.snapshot();
      const prod = production.projections[i];
      invariant(prod.id === step.id, 'checkpoint alignment');
      const balancesMatch = BigInt(prod.projection.totalSupply) === s.totalSupply
        && BigInt(prod.named.alice ?? '0') === (s.balances[nameAddr.alice] ?? 0n)
        && BigInt(prod.named.bob ?? '0') === (s.balances[nameAddr.bob] ?? 0n);
      const elig = s.allowlist === null ? null : (Boolean(prod.whitelistNamed.alice) === Boolean(s.allowlist[nameAddr.alice]) && Boolean(prod.whitelistNamed.bob) === Boolean(s.allowlist[nameAddr.bob]));
      const paused = s.paused === null ? null : prod.projection.paused === s.paused;
      const roles = s.operator2Issuer === null ? null : prod.operator2Subscription === s.operator2Issuer;
      components.balances.push(balancesMatch);
      components.eligibility.push(elig);
      components.navHistory.push(null); // not recorded by either comparator
      components.operatingStatus.push(paused);
      components.executionRoles.push(roles);
      components.requestRecords.push(null); // not recorded by either comparator
      const recordedAll = [balancesMatch, elig, null, paused, roles, null];
      components.completeProjection.push(recordedAll.every((v) => v === true));
      // Sensitivity: treat unrecorded components as matching when production value is empty.
      const emptyNav = prod.projection.navHistory.length === 0;
      const emptyReq = prod.projection.subscriptions.length === 0 && prod.projection.redemptions.length === 0;
      const valueEq = [balancesMatch, elig ?? (Object.values(prod.whitelistNamed).every((v) => !v)), emptyNav, paused ?? (prod.projection.paused === false), roles ?? (prod.operator2Subscription === false), emptyReq];
      components.completeProjectionValueEquality.push(valueEq.every(Boolean));
    });
    const summarize = (arr) => (arr.every((v) => v === null) ? { recorded: false, matched: null, checkpoints: arr.length } : { recorded: true, matched: arr.filter((v) => v === true).length, checkpoints: arr.length });
    result.comparators[kind] = {
      representedOperations: run.steps.filter((s) => s.represented).length,
      totalOperations: run.steps.length,
      eventsWritten: run.decoded.length,
      eventTypes: [...new Set(run.decoded.map((e) => e.eventName))],
      components: Object.fromEntries(Object.entries(components).map(([k, v]) => [k, summarize(v)])),
      navReferencesRecorded: 0,
      navReferencesRequired: production.navReferences,
    };
  }
  return result;
}

async function runComparatorGas(repetitions = 5) {
  const out = {};
  for (const kind of ['B1', 'B2']) {
    const runs = [];
    for (let r = 0; r < repetitions; r += 1) {
      const run = await runComparatorTrajectory(kind, 18680 + r);
      runs.push(run);
    }
    const byType = {};
    for (const run of runs) {
      for (const step of run.steps.filter((s) => s.represented)) {
        (byType[step.opType] ??= []).push(step.gasUsed);
      }
    }
    out[kind] = {
      repetitions,
      deploymentGas: runs[0].deployGas,
      deploymentGasIdenticalAcrossRuns: runs.every((x) => JSON.stringify(x.deployGas) === JSON.stringify(runs[0].deployGas)),
      deployedRuntimeBytes: runs[0].deployedSize,
      operations: Object.fromEntries(Object.entries(byType).map(([t, v]) => [t, { samples: v.length, meanGas: mean(v), sdGas: sd(v), min: Math.min(...v), max: Math.max(...v) }])),
    };
  }
  return out;
}

async function main() {
  const mapping = JSON.parse(await readFile(MAPPING_PATH, 'utf8'));
  const sealed = JSON.parse(await readFile(resolve(EVAL_DIR, 'spec/scenarios.v1.json'), 'utf8'));
  const provenance = {
    ...(await gitHead()),
    mappingSha256: await sha256File(MAPPING_PATH),
    planSha256: await sha256File(PLAN_PATH),
    sealedManifestSha256: await sha256File(resolve(EVAL_DIR, 'spec/scenarios.v1.json')),
    b1SourceSha256: await sha256File(resolve(EVAL_DIR, 'baselines/src/B1TokenOnly.sol')),
    b2SourceSha256: await sha256File(resolve(EVAL_DIR, 'baselines/src/B2PermissionedAllowlist.sol')),
    tools: toolVersions(),
    genesisTimestamp: GENESIS_TIMESTAMP,
    runAt: new Date().toISOString(),
  };
  const comparison = await runScenarioComparison(mapping, sealed);
  const recoverability = await runRecoverability();
  const gas = await runComparatorGas(5);
  const productionSamples = [];
  for (let i = 0; i < 5; i++) productionSamples.push(await productionCheckpointProjections(19100 + i));
  const productionGas = { repetitions: 5, deploymentGas: productionSamples[0].deploymentGas,
    samples: productionSamples.map((r) => r.checkpoints), operations: {} };
  for (let i = 0; i < 14; i++) {
    const values = productionSamples.map((r) => Number(r.checkpoints[i].gasUsed));
    productionGas.operations[productionSamples[0].checkpoints[i].operationId] = { samples: values, meanGas: mean(values), sdGas: sd(values) };
  }
  const summary = {
    experiment: 'paper85-v3-part-A-comparators',
    provenance,
    scenarioComparison: { totals: comparison.totals, preregisteredTotals: comparison.preregisteredTotals, byPredicate: comparison.byPredicate, allRowsMatchPreregistration: comparison.rows.every((r) => r.match) },
    recoverability,
    comparatorGas: gas,
    productionGas,
  };
  const rowsHash = await writeJson(resolve(RESULTS_DIR, 'A-scenario-rows.json'), comparison.rows);
  invariant(comparison.rows.every((r) => r.match), 'Baseline scenario mismatch');
  summary.rowsSha256 = rowsHash;
  const summaryHash = await writeJson(resolve(RESULTS_DIR, 'A-summary.json'), summary);
  console.log(JSON.stringify({ summaryHash, totals: comparison.totals, mismatches: comparison.rows.filter((r) => !r.match).map((r) => `${r.comparator}:${r.id} expected ${r.expected} observed ${r.observed}`), recoverability: Object.fromEntries(Object.entries(recoverability.comparators).map(([k, v]) => [k, v.components])), gas }, null, 2));
}

await main();
