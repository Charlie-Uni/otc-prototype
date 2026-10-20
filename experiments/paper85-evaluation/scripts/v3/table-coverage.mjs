// Coverage describes implemented checks, not a claim that all evidence was rerun.
import assert from 'node:assert/strict';

export const TABLE_COVERAGE = Object.freeze({
  3: { status: 'protocol-description', checked: 'EQ/protocol/source map only; no empirical values recomputed.' },
  4: { status: 'partial-raw-check', checked: 'Canonical deployment receipt gas and comparator artifact runtime sizes.',
    limits: 'Host/tool/network metadata and production artifact sizes are archived descriptions, not newly measured or fully checked here.' },
  5: { status: 'source-description', checked: 'Implementation/model mapping is a source-review claim, not a numerical replay result.' },
  6: { status: 'inherited-not-recomputed', checked: 'Uses frozen v2.1 functional/mechanism results.',
    limits: 'This verifier does not rerun or reconstruct v2.1 scenario outcomes.' },
  7: { status: 'inherited-not-recomputed', checked: 'Uses frozen v2.1 ablation results.',
    limits: 'This verifier does not rerun or reconstruct v2.1 ablation outcomes.' },
  8: { status: 'raw-recomputed-with-inherited-column',
    checked: 'All 84 B1/B2 labels; 50 executed outcomes and snapshots bound to scenario-scoped receipt/rejection records; ' +
      'totals and predicate counts; displayed B1/B2 cells.',
    limits: 'Prototype column inherits Table 6. Unrepresentability uses the frozen action:null mapping; business equivalence of mapped actions still requires review.' },
  9: { status: 'raw-recomputed', checked: 'Raw production and comparator logs, 14 checkpoints per mechanism, component counts, event counts/types, NAV references and displayed cells.',
    limits: 'Fixture account positions and candidate issuance/subscription role correspondence are explicit assumptions. Missing components remain unrecorded.' },
  10: { status: 'raw-recomputed', checked: '130 operation receipts from 15 fresh archived trajectories; sample gas, mean, sample SD, min/max, workflow sums/means, ratios and displayed numeric cells.',
    limits: 'Archived executions are not repeated. Gas differences are not a measured decomposition of individual guard costs.' },
  11: { status: 'raw-recomputed', checked: 'Nine scale runs: operation receipts, gas, storage maps, raw/index bytes, replay/projection/NAV results, saved timing samples and aggregate means/SD.',
    limits: 'Timing measurements are not repeated; displayed rounding is not separately compared by this verifier.' },
  12: { status: 'partial-raw-check', checked: '26 step outcomes compared with one post-review oracle; 23 accepted checkpoint projections replayed.',
    limits: 'Rejected-step error labels are checked as archived observations, not re-simulated or independently decoded from the case rejection journal.' },
  13: { status: 'raw-recomputed', checked: 'Complete Q1–Q7 answers and detail arrays, plus the next-NAV counterexample pricing audit.',
    limits: 'Same-asOf corrections and dealing/suspension rules are disclosed case-policy assumptions. Expert validity and legal compliance are not established.' },
});

const numbers = (text) => (text.replaceAll(',', '').match(/\d+(?:\.\d+)?/g) ?? []).map(Number);
const countCell = (counts) => ['blocked', 'accepted_state_change', 'accepted_no_state_change', 'not_representable']
  .map((label) => counts[label] ?? 0).join(' / ');

export function verifyTableDisplays(claims, { table8, table9, table10 }) {
  const predicates = Object.entries(table8.byPredicate);
  const rows8 = claims.tables['8'].displayedCells;
  assert.equal(rows8.length, predicates.length + 3, 'Table 8 displayed rows');
  predicates.forEach(([predicate, group], index) => {
    const row = rows8[index + 1]; assert.equal(row[0], predicate);
    assert.equal(row[1], String(group.scenarios));
    assert.equal(row[3], countCell(group.B2)); assert.equal(row[4], countCell(group.B1));
  });
  assert.equal(rows8.at(-2)[1], String(predicates.reduce((sum, [, group]) => sum + group.scenarios, 0)));
  for (const [kind, column] of [['B2', 3], ['B1', 4]]) {
    const total = table8.totals[kind];
    assert.deepEqual(numbers(rows8.at(-2)[column]), [total.invalidBlocked, total.invalidAcceptedStateChange,
      total.invalidAcceptedNoStateChange, total.invalidNotRepresentable], 'Table 8 displayed totals');
    assert.equal(rows8.at(-1)[column], String(total.validRepresented));
  }
  assert.equal(rows8.at(-1)[1], String(table8.totals.B1.validRepresented + table8.totals.B1.validNotRepresentable
    + table8.totals.B1.validRejected));

  const rows9 = claims.tables['9'].displayedCells;
  assert.equal(rows9.length, 10, 'Table 9 displayed rows');
  const keys = ['balances', 'eligibility', 'navHistory', 'operatingStatus', 'executionRoles', 'requestRecords'];
  const componentCell = (kind, key) => {
    const value = table9.comparators[kind].components[key];
    return value.recorded ? `${value.matched}/${value.checkpoints}` : '未记录';
  };
  keys.forEach((key, index) => assert.deepEqual(rows9[index + 1].slice(1),
    [`${table9.productionCheckpoints}/${table9.productionCheckpoints}`, componentCell('B2', key), componentCell('B1', key)],
    `Table 9 displayed ${key}`));
  const refs = table9.productionNavReferences;
  assert.deepEqual(rows9[7].slice(1), [`${refs}/${refs}`, `未记录（0/${refs}）`, `未记录（0/${refs}）`]);
  assert.deepEqual(rows9[8].slice(1), [`${table9.productionCheckpoints}/${table9.productionCheckpoints}`,
    componentCell('B2', 'completeProjection'), componentCell('B1', 'completeProjection')]);
  assert.deepEqual(numbers(rows9[9][1]), [table9.productionAcceptedEvents, Object.keys(table9.productionEventTypes).length]);
  for (const [kind, column] of [['B2', 2], ['B1', 3]]) {
    assert.deepEqual(numbers(rows9[9][column]), [table9.comparators[kind].eventsWritten, table9.comparators[kind].eventTypes.length]);
  }

  const rows10 = claims.tables['10'].displayedCells;
  assert.equal(rows10.length, Object.keys(table10.table).length + 1, 'Table 10 displayed rows');
  Object.entries(table10.table).forEach(([key, value], index) => {
    const row = rows10[index + 1]; const expected = [value.productionMeanGas];
    if (key === 'subscription') expected.push(table10.production.O04.meanGas, table10.production.O05.meanGas);
    if (key === 'redemption') expected.push(table10.production.O08.meanGas, table10.production.O10.meanGas);
    assert.deepEqual(numbers(row[1]), expected, `Table 10 displayed ${key}`);
    for (const [column, gas] of [[2, value.B2MeanGas], [3, value.B1MeanGas]]) {
      if (gas === null) assert.equal(row[column], '—');
      else assert.deepEqual(numbers(row[column]), [gas]);
    }
    assert.equal(row[4], value.displayedRatioToB2 ?? '—', `Table 10 displayed ratio ${key}`);
  });
  return { tables: [8, 9, 10], matched: true, excluded: ['Table 8 inherited prototype column'],
    scope: 'Displayed-cell JSON source map, not DOCX byte/layout validation' };
}
