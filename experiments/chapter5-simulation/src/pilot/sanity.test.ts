import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { parseSimulationConfig } from '../core/config';
import { runPilotSanity } from './sanity';

const baseline = parseSimulationConfig(JSON.parse(readFileSync(
  new URL('../../config/pilot-baseline.json', import.meta.url),
  'utf8',
)) as unknown);

test('passes only mechanism-local sanity checks without imposing a regime ranking', {
  timeout: 15_000,
}, () => {
  const report = runPilotSanity(baseline, {
    replicateId: 0,
    mechanismHorizonDays: 15,
    includeRegimeDiagnostics: false,
  });
  assert.equal(report.checks.length, 8);
  assert.equal(report.overallPassed, true);
  assert.ok(report.checks.every(({ passed }) => passed));
  assert.deepEqual(report.regimeDiagnostics, []);
  assert.deepEqual(report.calibrationFlags, []);
  assert.equal(report.diagnosticRankingIsPassGate, false);
  assert.match(report.semanticDigestSha256, /^[0-9a-f]{64}$/);
});

test('requires the sanity horizon to cover the longest NAV update cadence', () => {
  assert.throws(() => runPilotSanity(baseline, {
    mechanismHorizonDays: 13,
    includeRegimeDiagnostics: false,
  }), /SANITY_HORIZON_MUST_COVER_MAX_NAV_CADENCE/);
});

test('reports regime outcomes as non-gating diagnostics and flags pilot saturation', {
  timeout: 15_000,
}, () => {
  const report = runPilotSanity(baseline, { mechanismHorizonDays: 15 });
  assert.equal(report.overallPassed, true);
  assert.deepEqual(report.regimeDiagnostics.map(({ regimeId }) => regimeId), [
    'R0', 'R1', 'R2', 'R3', 'R4',
  ]);
  assert.equal(report.diagnosticRankingIsPassGate, false);
  assert.deepEqual(report.calibrationFlags.map(({ code }) => code), [
    'REDEMPTION_PRESSURE_SATURATED',
    'REGIME_DEMAND_SATURATED',
  ]);
});
