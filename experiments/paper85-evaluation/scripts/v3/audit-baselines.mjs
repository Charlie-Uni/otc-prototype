// Pure reconstruction of baseline classifications, recoverability and gas.
import assert from 'node:assert/strict';
import { mean, sd } from './common.mjs';

const ZERO = `0x${'0'.repeat(40)}`;
const lower = (value) => value.toLowerCase();


export function classifyScenario(row, represented) {
  if (!represented) {
    assert.equal(row.status, undefined, 'Unrepresentable operation has an execution outcome');
    return 'not_representable';
  }
  assert(['accepted', 'rejected'].includes(row.status), 'Missing execution status');
  const changed = ['totalSupply', 'alice', 'bob'].some((key) => {
    assert(Object.hasOwn(row.before, key) && Object.hasOwn(row.after, key), `Missing balance ${key}`);
    return BigInt(row.before[key]) !== BigInt(row.after[key]);
  });
  assert.equal(row.ledgerChanged, changed, 'Ledger change flag');
  if (row.status === 'rejected') {
    assert.equal(row.stage, 'eth_call', 'Rejection must be an archived simulation');
    assert.deepEqual(row.before, row.after, 'Rejected operation changed state');
    return 'blocked';
  }
  assert.equal(row.stage, 'mined');
  return row.class === 'valid' ? 'represented_accept'
    : changed ? 'accepted_state_change' : 'accepted_no_state_change';
}

export function summarizeClassifications(rows) {
  const totals = {}; const byPredicate = {};
  for (const kind of ['B1', 'B2']) {
    const mine = rows.filter((row) => row.comparator === kind);
    const count = (cls, label) => mine.filter((r) => r.class === cls && r.observed === label).length;
    totals[kind] = {
      validRepresented: count('valid', 'represented_accept'), validNotRepresentable: count('valid', 'not_representable'),
      validRejected: count('valid', 'blocked'), invalidBlocked: count('invalid', 'blocked'),
      invalidAcceptedStateChange: count('invalid', 'accepted_state_change'),
      invalidAcceptedNoStateChange: count('invalid', 'accepted_no_state_change'),
      invalidNotRepresentable: count('invalid', 'not_representable'),
      expectedMatches: mine.filter((r) => r.expected === r.observed).length, rows: mine.length,
    };
  }
  for (const row of rows.filter((r) => r.class === 'invalid')) {
    const group = byPredicate[row.targetPredicate] ??= { scenarios: 0, B1: {}, B2: {} };
    if (row.comparator === 'B1') group.scenarios++;
    group[row.comparator][row.observed] = (group[row.comparator][row.observed] ?? 0) + 1;
  }
  return { totals, byPredicate };
}

export function replayComparator(kind, { issuerRole, operator2 }) {
  assert(['B1', 'B2'].includes(kind));
  const state = { balances: {}, totalSupply: 0n, allowlist: kind === 'B2' ? {} : null,
    paused: kind === 'B2' ? false : null, operator2Issuer: kind === 'B2' ? false : null };
  return {
    apply({ eventName, args: a }) {
      if (eventName === 'Transfer') {
        const value = BigInt(a.value); const from = lower(a.from); const to = lower(a.to);
        if (from === ZERO) state.totalSupply += value;
        else state.balances[from] = (state.balances[from] ?? 0n) - value;
        if (to === ZERO) state.totalSupply -= value;
        else state.balances[to] = (state.balances[to] ?? 0n) + value;
      } else if (eventName === 'AllowlistUpdated') state.allowlist[lower(a.account)] = Boolean(a.allowed);
      else if (eventName === 'Paused') state.paused = true;
      else if (eventName === 'Unpaused') state.paused = false;
      else if (['RoleGranted', 'RoleRevoked'].includes(eventName)) {
        if (lower(a.role) === lower(issuerRole) && lower(a.account) === lower(operator2)) {
          state.operator2Issuer = eventName === 'RoleGranted';
        }
      } else assert.equal(eventName, 'Approval', `Unsupported comparator event ${eventName}`);
    },
    snapshot: () => structuredClone(state),
  };
}

// Production projections are reconstructed from raw logs by the caller. Missing
// components remain null; an empty production value does not make them recorded.
export function recoverComponents(kind, events, steps, production, actors) {
  assert.equal(steps.length, production.length, 'Checkpoint count');
  const replay = replayComparator(kind, actors); let cursor = 0;
  const components = Object.fromEntries(['balances', 'eligibility', 'navHistory', 'operatingStatus',
    'executionRoles', 'requestRecords', 'completeProjection', 'completeProjectionValueEquality'].map((key) => [key, []]));
  for (const [index, step] of steps.entries()) {
    assert.equal(step.id, `O${String(index + 1).padStart(2, '0')}`, 'Checkpoint alignment');
    if (step.represented) {
      while (cursor < events.length && BigInt(events[cursor].blockNumber) <= BigInt(step.blockNumber)) {
        replay.apply(events[cursor++]);
      }
    }
    const state = replay.snapshot(); const prod = production[index];
    const balances = BigInt(prod.totalSupply) === state.totalSupply
      && ['alice', 'bob'].every((name) => BigInt(prod.balances[actors.production[name]] ?? 0)
        === (state.balances[actors[name]] ?? 0n));
    const eligibility = state.allowlist === null ? null : ['alice', 'bob'].every((name) =>
      Boolean(prod.whitelist[actors.production[name]]) === Boolean(state.allowlist[actors[name]]));
    const operatingStatus = state.paused === null ? null : prod.paused === state.paused;
    const executionRoles = state.operator2Issuer === null ? null
      : Boolean(prod.roles[actors.production.roleKey]) === state.operator2Issuer;
    const recorded = { balances, eligibility, navHistory: null, operatingStatus, executionRoles, requestRecords: null };
    for (const [key, value] of Object.entries(recorded)) components[key].push(value);
    components.completeProjection.push(Object.values(recorded).every((value) => value === true));
    components.completeProjectionValueEquality.push([
      balances, eligibility ?? Object.values(prod.whitelist).every((value) => !value), prod.navHistory.length === 0,
      operatingStatus ?? !prod.paused, executionRoles ?? !prod.roles[actors.production.roleKey],
      prod.subscriptions.length === 0 && prod.redemptions.length === 0,
    ].every(Boolean));
  }
  assert.equal(cursor, events.length, 'Unassigned comparator events');
  return Object.fromEntries(Object.entries(components).map(([key, values]) => [key, {
    recorded: !values.every((value) => value === null),
    matched: values.every((value) => value === null) ? null : values.filter((value) => value === true).length,
    checkpoints: values.length,
  }]));
}

export const gasStatistics = (values) => {
  assert(values.length > 0 && values.every((v) => Number.isSafeInteger(v) && v > 0), 'Invalid gas samples');
  return { samples: values.length, meanGas: mean(values), sdGas: sd(values), min: Math.min(...values), max: Math.max(...values) };
};

// Matches the manuscript's disclosed workflow-sum / paired-operation-mean rule.
export function gasTable(production, comparators) {
  const categories = [
    ['qualification', ['O01', 'O02']], ['navSubmission', ['O03', 'O07']],
    ['subscription', ['O04', 'O05'], true], ['redemption', ['O08', 'O10'], true],
    ['transfer', ['O06']], ['pauseResume', ['O11', 'O12']],
    ['roleUpdate', ['O13', 'O14']], ['settlementDelay', ['O09']],
  ];
  return Object.fromEntries(categories.map(([key, ids, sum]) => {
    const value = ids.reduce((total, id) => total + production[id].meanGas, 0) / (sum ? 1 : ids.length);
    const b1 = comparators.B1.operations[key]?.meanGas ?? null;
    const b2 = comparators.B2.operations[key]?.meanGas ?? null;
    return [key, { productionMeanGas: value, B1MeanGas: b1, B2MeanGas: b2,
      ratioToB2: b2 === null ? null : value / b2, displayedRatioToB2: b2 === null ? null : (value / b2).toFixed(2) }];
  }));
}
