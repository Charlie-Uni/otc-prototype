import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const EXPECTED_IDS = [
  ...Array.from({ length: 18 }, (_, index) => `V${String(index + 1).padStart(2, '0')}`),
  ...Array.from({ length: 24 }, (_, index) => `I${String(index + 1).padStart(2, '0')}`),
];

const OPERATIONS = new Set([
  'updateQualification',
  'submitNAV',
  'subscribe',
  'redeem',
  'transfer',
  'pause',
  'resume',
  'updateRole',
]);

const OPERATION_CALLS = new Map([
  ['updateQualification', new Set(['setWhitelisted'])],
  ['submitNAV', new Set(['postInitialNAV', 'postNAV'])],
  ['subscribe', new Set(['requestSubscription', 'requestSubscriptionFor', 'acceptSubscription'])],
  ['redeem', new Set(['requestRedemption', 'requestRedemptionFor', 'settleRedemption', 'flagSettlementDelayed'])],
  ['transfer', new Set(['transfer', 'transferFrom'])],
  ['pause', new Set(['pause'])],
  ['resume', new Set(['unpause'])],
  ['updateRole', new Set(['grantRole', 'revokeRole'])],
]);

const CALL_ARGUMENTS = new Map([
  ['deployRiskRegistry', ['admin', 'initialWeightsBps', 'maxStaleAgeSec', 'kappaBps']],
  ['deployNAVRegistry', ['admin']],
  ['deployFundToken', ['admin', 'fundId', 'navRegistry']],
  ['setRiskGate', ['riskGate']],
  ['grantRole', ['contract', 'role', 'account']],
  ['revokeRole', ['contract', 'role', 'account']],
  ['setWhitelisted', ['investor', 'eligible', 'vcHash']],
  ['postInitialNAV', ['fundId', 'initialNav', 'asOfSec', 'payloadHash']],
  ['postNAV', ['fundId', 'netAssetValue', 'totalSharesSnapshot', 'asOfSec', 'payloadHash']],
  ['requestSubscription', ['subscriptionAmount']],
  ['requestSubscriptionFor', ['investor', 'subscriptionAmount']],
  ['acceptSubscription', ['requestId']],
  ['transfer', ['to', 'amount']],
  ['approve', ['spender', 'amount']],
  ['transferFrom', ['from', 'to', 'amount']],
  ['requestRedemption', ['redeemedShares']],
  ['requestRedemptionFor', ['investor', 'redeemedShares']],
  ['settleRedemption', ['requestId']],
  ['flagSettlementDelayed', ['requestId', 'reasonHash']],
  ['pause', []],
  ['unpause', []],
]);

const PREDICATE_VARIANTS = new Map([
  ['Authorized', 'M1'],
  ['ComplianceValid', 'M2'],
  ['NAVValid', 'M3'],
  ['LifecycleValid', 'M4'],
  ['ParamConsistent', 'M5'],
]);

const EXPECTED_TAXONOMY = [
  'expected_accept',
  'expected_reject',
  'invalid_transition_accepted',
  'rejected_by_residual_guard',
  'runtime_revert',
  'state_divergence',
  'event_divergence',
];

const ACTOR_KEYS = [
  'admin',
  'manager',
  'subscriptionOperator',
  'redemptionOperator',
  'pauser',
  'operator2',
  'transferOperator',
  'alice',
  'bob',
  'stranger',
];

const CONSTANT_KEYS = [
  'fundId',
  'aliceVcHash',
  'bobVcHash',
  'initialNavPayloadHash',
  'formulaNav1PayloadHash',
  'formulaNav2PayloadHash',
  'navCorrectionPayloadHash',
  'delayReasonHash',
  'initialNav',
  'highNav',
  'subscriptionAmount',
  'redemptionAmount',
  'initialWeightsBps',
  'maxStaleAgeSec',
  'kappaBps',
];

const ADDRESS_PATTERN = /^0x[0-9a-f]{40}$/;
const BYTES32_PATTERN = /^0x[0-9a-f]{64}$/;
const ERROR_KINDS = new Set(['string', 'customError', 'panic']);
const CONTRACT_NAMES = new Set(['FundToken', 'NAVRegistry', 'RiskRegistry']);
const ROLE_NAMES = new Set(['DEFAULT_ADMIN_ROLE', 'MANAGER_ROLE', 'SUBSCRIPTION_ROLE', 'REDEMPTION_ROLE', 'PAUSER_ROLE']);
const ACTOR_ARGUMENTS = new Set(['admin', 'investor', 'account', 'from', 'to', 'spender']);

export const MANIFEST_URL = new URL('../spec/scenarios.v1.json', import.meta.url);

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function hasExactKeys(actual, expected, label) {
  invariant(actual !== null && typeof actual === 'object' && !Array.isArray(actual), `${label} must be an object`);
  const keys = Object.keys(actual).sort();
  const wanted = [...expected].sort();
  invariant(JSON.stringify(keys) === JSON.stringify(wanted), `${label} keys do not match the preregistered shape`);
}

function validateExpectation(expectation, label) {
  invariant(['accept', 'reject'].includes(expectation?.outcome), `${label}: invalid outcome`);
  if (expectation.outcome === 'accept') {
    hasExactKeys(expectation, ['outcome'], label);
    return;
  }
  hasExactKeys(expectation, ['outcome', 'errorKind', 'errorCode', 'errorArgs'], label);
  invariant(ERROR_KINDS.has(expectation.errorKind), `${label}: invalid error kind`);
  invariant(typeof expectation.errorCode === 'string' && expectation.errorCode.length > 0, `${label}: error code required`);
  invariant(Array.isArray(expectation.errorArgs), `${label}: error arguments must be an array`);
  invariant(expectation.errorArgs.every((arg) => typeof arg === 'string'), `${label}: invalid error argument`);
}

function validateReference(value, manifest, label) {
  if (typeof value === 'string' && value.startsWith('$')) {
    invariant(Object.hasOwn(manifest.constants, value.slice(1)), `${label}: unknown constant reference ${value}`);
  }
}

function validateCall(call, manifest, label, isStep = false) {
  hasExactKeys(call, isStep ? ['atSec', 'call', 'caller', 'args'] : ['call', 'caller', 'args'], label);
  invariant(CALL_ARGUMENTS.has(call.call), `${label}: unsupported call ${call.call}`);
  invariant(call.caller === 'harness' || Object.hasOwn(manifest.actors, call.caller), `${label}: unknown caller ${call.caller}`);
  if (call.call.startsWith('deploy')) {
    invariant(call.caller === 'harness', `${label}: deployments must use the scenario harness`);
  } else {
    invariant(call.caller !== 'harness', `${label}: harness may only deploy contracts`);
  }
  hasExactKeys(call.args, CALL_ARGUMENTS.get(call.call), `${label}.args`);
  for (const [name, value] of Object.entries(call.args)) {
    validateReference(value, manifest, `${label}.args.${name}`);
    if (ACTOR_ARGUMENTS.has(name)) {
      invariant(Object.hasOwn(manifest.actors, value), `${label}.args.${name}: unknown actor ${value}`);
    }
    if (name === 'contract') {
      invariant(CONTRACT_NAMES.has(value), `${label}.args.contract: unknown contract ${value}`);
    }
    if (name === 'role') {
      invariant(ROLE_NAMES.has(value), `${label}.args.role: unknown role ${value}`);
    }
    if (name === 'navRegistry') {
      invariant(value === 'NAVRegistry', `${label}.args.navRegistry must reference NAVRegistry`);
    }
    if (name === 'riskGate') {
      invariant(value === 'RiskRegistry', `${label}.args.riskGate must reference RiskRegistry`);
    }
    if (name === 'requestId') {
      invariant(Number.isInteger(value) && value >= 0, `${label}.args.requestId: invalid request id`);
    }
    if (name === 'asOfSec') {
      invariant(Number.isInteger(value) && value > 0, `${label}.args.asOfSec: invalid relative timestamp`);
      if (isStep) invariant(value <= call.atSec, `${label}.args.asOfSec cannot be in the future`);
    }
  }
  if (isStep) invariant(Number.isInteger(call.atSec) && call.atSec > 0, `${label}: invalid step time`);
}

function validateActorsAndConstants(manifest) {
  hasExactKeys(manifest.actors, ACTOR_KEYS, 'actors');
  const addresses = Object.values(manifest.actors);
  invariant(addresses.every((address) => ADDRESS_PATTERN.test(address)), 'actor address must be lowercase 20-byte hex');
  invariant(new Set(addresses).size === addresses.length, 'actor addresses must be distinct');

  hasExactKeys(manifest.constants, CONSTANT_KEYS, 'constants');
  for (const key of [
    'fundId',
    'aliceVcHash',
    'bobVcHash',
    'initialNavPayloadHash',
    'formulaNav1PayloadHash',
    'formulaNav2PayloadHash',
    'navCorrectionPayloadHash',
    'delayReasonHash',
  ]) {
    invariant(BYTES32_PATTERN.test(manifest.constants[key]), `${key}: expected bytes32 hex`);
    invariant(!/^0x0{64}$/.test(manifest.constants[key]), `${key}: zero commitment is not allowed`);
  }
  for (const key of ['initialNav', 'highNav', 'subscriptionAmount', 'redemptionAmount']) {
    invariant(/^(0|[1-9][0-9]*)$/.test(manifest.constants[key]), `${key}: expected unsigned decimal string`);
  }
  invariant(
    Array.isArray(manifest.constants.initialWeightsBps) && manifest.constants.initialWeightsBps.length === 6,
    'initialWeightsBps must contain six weights',
  );
  invariant(
    manifest.constants.initialWeightsBps.reduce((sum, weight) => sum + weight, 0) === 10_000,
    'initialWeightsBps must sum to 10000',
  );
  invariant(Number.isInteger(manifest.constants.maxStaleAgeSec) && manifest.constants.maxStaleAgeSec > 0, 'invalid maxStaleAgeSec');
  invariant(Number.isInteger(manifest.constants.kappaBps) && manifest.constants.kappaBps > 0 && manifest.constants.kappaBps <= 10_000, 'invalid kappaBps');
}

function validateFixtures(manifest) {
  invariant(manifest.fixtures !== null && typeof manifest.fixtures === 'object', 'fixtures must be an object');
  invariant(Object.hasOwn(manifest.fixtures, 'bare'), 'bare fixture is required');
  const memo = new Map();

  function flattenedSteps(name, stack = []) {
    if (memo.has(name)) return memo.get(name);
    invariant(Object.hasOwn(manifest.fixtures, name), `unknown fixture ${name}`);
    invariant(!stack.includes(name), `fixture cycle: ${[...stack, name].join(' -> ')}`);
    const fixture = manifest.fixtures[name];
    hasExactKeys(fixture, ['extends', 'steps'], `fixture ${name}`);
    invariant(fixture.extends === null || typeof fixture.extends === 'string', `fixture ${name}: invalid parent`);
    invariant(Array.isArray(fixture.steps), `fixture ${name}: steps must be an array`);
    const inherited = fixture.extends === null ? [] : flattenedSteps(fixture.extends, [...stack, name]);
    fixture.steps.forEach((item, index) => validateCall(item, manifest, `fixture ${name}.steps[${index}]`, true));
    const all = [...inherited, ...fixture.steps];
    for (let index = 1; index < all.length; index += 1) {
      invariant(all[index - 1].atSec < all[index].atSec, `fixture ${name}: step times must be strictly increasing`);
    }
    memo.set(name, all);
    return all;
  }

  for (const name of Object.keys(manifest.fixtures)) flattenedSteps(name);
  return memo;
}

function validateScenario(scenario, manifest, fixtureSteps) {
  const expectedKeys = [
    'id',
    'class',
    'operation',
    ...(scenario.class === 'invalid' ? ['targetPredicate'] : []),
    'fixture',
    'action',
    'actionLabel',
    'actionAtSec',
    'baselineExpected',
    'ablationHypothesis',
    'stateAssertions',
    'rationale',
  ];
  hasExactKeys(scenario, expectedKeys, `scenario ${scenario.id ?? '<unknown>'}`);
  invariant(['valid', 'invalid'].includes(scenario.class), `${scenario.id}: invalid class`);
  invariant(OPERATIONS.has(scenario.operation), `${scenario.id}: unsupported operation`);
  invariant(Object.hasOwn(manifest.fixtures, scenario.fixture), `${scenario.id}: unknown fixture ${scenario.fixture}`);
  validateCall(scenario.action, manifest, `${scenario.id}.action`);
  invariant(OPERATION_CALLS.get(scenario.operation).has(scenario.action.call), `${scenario.id}: action does not match operation`);
  invariant(typeof scenario.actionLabel === 'string' && scenario.actionLabel.length >= 10, `${scenario.id}: action label required`);
  invariant(Number.isInteger(scenario.actionAtSec) && scenario.actionAtSec > 0, `${scenario.id}: invalid action time`);
  if (Object.hasOwn(scenario.action.args, 'asOfSec')) {
    invariant(scenario.action.args.asOfSec <= scenario.actionAtSec, `${scenario.id}: asOfSec cannot be in the future`);
  }
  const steps = fixtureSteps.get(scenario.fixture);
  invariant(steps.length === 0 || steps.at(-1).atSec < scenario.actionAtSec, `${scenario.id}: fixture must finish before action`);
  validateExpectation(scenario.baselineExpected, `${scenario.id}.baselineExpected`);
  invariant(Array.isArray(scenario.stateAssertions) && scenario.stateAssertions.length > 0, `${scenario.id}: state assertions required`);
  invariant(typeof scenario.rationale === 'string' && scenario.rationale.length >= 10, `${scenario.id}: rationale required`);
  invariant(manifest.resultTaxonomy.includes(scenario.ablationHypothesis.classification), `${scenario.id}: unknown classification`);

  if (scenario.class === 'valid') {
    hasExactKeys(scenario.ablationHypothesis, ['variant', 'expectedOutcome', 'classification'], `${scenario.id}.ablationHypothesis`);
    invariant(scenario.baselineExpected.outcome === 'accept', `${scenario.id}: valid scenario must be accepted`);
    invariant(scenario.ablationHypothesis.variant === 'all', `${scenario.id}: valid scenario must apply to all variants`);
    invariant(scenario.ablationHypothesis.expectedOutcome === 'accept', `${scenario.id}: valid scenario must remain accepted`);
    invariant(scenario.ablationHypothesis.classification === 'expected_accept', `${scenario.id}: invalid valid-scenario classification`);
    return;
  }

  const hypothesisKeys = ['variant', 'expectedOutcome', 'classification', 'expectedResidualGuard'];
  if (scenario.ablationHypothesis.expectedOutcome === 'reject') hypothesisKeys.push('expectedError');
  hasExactKeys(scenario.ablationHypothesis, hypothesisKeys, `${scenario.id}.ablationHypothesis`);
  invariant(PREDICATE_VARIANTS.has(scenario.targetPredicate), `${scenario.id}: target predicate required`);
  invariant(scenario.baselineExpected.outcome === 'reject', `${scenario.id}: invalid scenario must be rejected by M0`);
  invariant(
    scenario.ablationHypothesis.variant === PREDICATE_VARIANTS.get(scenario.targetPredicate),
    `${scenario.id}: ablation variant does not match target predicate`,
  );
  if (scenario.ablationHypothesis.expectedOutcome === 'reject') {
    validateExpectation(scenario.ablationHypothesis.expectedError, `${scenario.id}.ablationHypothesis.expectedError`);
    invariant(
      ['rejected_by_residual_guard', 'runtime_revert'].includes(scenario.ablationHypothesis.classification),
      `${scenario.id}: rejected ablation has invalid classification`,
    );
    invariant(
      typeof scenario.ablationHypothesis.expectedResidualGuard === 'string'
        && scenario.ablationHypothesis.expectedResidualGuard.length > 0,
      `${scenario.id}: residual rejection rationale required`,
    );
  } else {
    invariant(scenario.ablationHypothesis.expectedOutcome === 'accept', `${scenario.id}: invalid ablation outcome`);
    invariant(scenario.ablationHypothesis.classification === 'invalid_transition_accepted', `${scenario.id}: invalid accepted-ablation classification`);
    invariant(scenario.ablationHypothesis.expectedResidualGuard === null, `${scenario.id}: accepted ablation cannot name a residual guard`);
  }
}

export function validateManifest(manifest) {
  hasExactKeys(manifest, [
    'schemaVersion',
    'sourceArtifact',
    'counts',
    'determinism',
    'predicates',
    'variants',
    'resultTaxonomy',
    'fixtures',
    'scenarios',
    'actors',
    'constants',
  ], 'manifest');
  invariant(manifest.schemaVersion === 1, 'schemaVersion must be 1');
  hasExactKeys(manifest.sourceArtifact, ['tag', 'evidenceAnchor', 'fundTokenPath', 'navRegistryPath', 'riskRegistryPath'], 'sourceArtifact');
  invariant(manifest.sourceArtifact.tag === 'chapter3-artifact-v1.4.0', 'source tag must be v1.4.0');
  invariant(/^[0-9a-f]{40}$/.test(manifest.sourceArtifact.evidenceAnchor), 'invalid evidence anchor');
  invariant(manifest.sourceArtifact.fundTokenPath === 'contracts/src/FundToken.sol', 'invalid FundToken path');
  invariant(manifest.sourceArtifact.navRegistryPath === 'contracts/src/NAVRegistry.sol', 'invalid NAVRegistry path');
  invariant(manifest.sourceArtifact.riskRegistryPath === 'contracts/src/RiskRegistry.sol', 'invalid RiskRegistry path');

  hasExactKeys(manifest.counts, ['total', 'valid', 'invalid'], 'counts');
  invariant(manifest.counts.total === 42, 'total scenario count must be 42');
  invariant(manifest.counts.valid === 18, 'valid scenario count must be 18');
  invariant(manifest.counts.invalid === 24, 'invalid scenario count must be 24');

  hasExactKeys(manifest.determinism, [
    'chainId',
    'genesisTimestamp',
    'oneOperationPerBlock',
    'freshDeploymentPerScenario',
    'semanticDigestExcludes',
    'semanticDigestIncludes',
    'deploymentOrder',
    'restoreDeployerNonceBeforeEachArm',
    'riskGatePolicy',
    'actorBinding',
  ], 'determinism');
  invariant(manifest.determinism.chainId === 31337, 'chainId must be fixed at 31337');
  invariant(manifest.determinism.genesisTimestamp === 1_710_000_000, 'genesis timestamp changed');
  invariant(manifest.determinism.oneOperationPerBlock === true, 'one operation per block is required');
  invariant(manifest.determinism.freshDeploymentPerScenario === true, 'fresh deployment per scenario is required');
  invariant(manifest.determinism.restoreDeployerNonceBeforeEachArm === true, 'deployer nonce reset is required');
  invariant(JSON.stringify(manifest.determinism.deploymentOrder) === JSON.stringify(['RiskRegistry', 'NAVRegistry', 'FundToken']), 'deployment order changed');
  invariant(manifest.determinism.actorBinding === 'fixed manifest addresses', 'actor binding changed');
  invariant(typeof manifest.determinism.riskGatePolicy === 'string' && manifest.determinism.riskGatePolicy.length > 20, 'risk Gate policy required');

  invariant(JSON.stringify(manifest.predicates) === JSON.stringify([...PREDICATE_VARIANTS.keys()]), 'predicate order changed');
  hasExactKeys(manifest.variants, ['M0', 'M1', 'M2', 'M3', 'M4', 'M5'], 'variants');
  invariant(JSON.stringify(manifest.resultTaxonomy) === JSON.stringify(EXPECTED_TAXONOMY), 'result taxonomy changed');
  validateActorsAndConstants(manifest);
  const fixtureSteps = validateFixtures(manifest);

  invariant(Array.isArray(manifest.scenarios) && manifest.scenarios.length === 42, 'scenario array must contain 42 rows');
  const ids = manifest.scenarios.map(({ id }) => id);
  invariant(new Set(ids).size === ids.length, 'scenario ids must be unique');
  invariant(JSON.stringify(ids) === JSON.stringify(EXPECTED_IDS), 'scenario ids or order changed');
  manifest.scenarios.forEach((scenario) => validateScenario(scenario, manifest, fixtureSteps));

  const valid = manifest.scenarios.filter((scenario) => scenario.class === 'valid');
  const invalid = manifest.scenarios.filter((scenario) => scenario.class === 'invalid');
  invariant(valid.length === 18 && invalid.length === 24, 'scenario class counts do not match 18/24');

  const coveredOperations = new Set(manifest.scenarios.map(({ operation }) => operation));
  invariant(coveredOperations.size === OPERATIONS.size, 'not all formal lifecycle operations are covered');
  const predicateCounts = new Map([...PREDICATE_VARIANTS.keys()].map((predicate) => [predicate, 0]));
  for (const scenario of invalid) {
    predicateCounts.set(scenario.targetPredicate, predicateCounts.get(scenario.targetPredicate) + 1);
  }
  invariant(JSON.stringify([...predicateCounts.values()]) === JSON.stringify([5, 4, 4, 4, 7]), 'predicate distribution changed');
  invariant(
    manifest.scenarios.find(({ id }) => id === 'I05').action.call === 'grantRole',
    'I05 must cover unauthorized role updates',
  );

  return {
    total: manifest.scenarios.length,
    valid: valid.length,
    invalid: invalid.length,
    predicateCounts: Object.fromEntries(predicateCounts),
    operationCount: coveredOperations.size,
    fixtureCount: Object.keys(manifest.fixtures).length,
  };
}

export async function loadManifest(url = MANIFEST_URL) {
  const bytes = await readFile(url);
  return {
    bytes,
    manifest: JSON.parse(bytes.toString('utf8')),
    sha256: createHash('sha256').update(bytes).digest('hex'),
  };
}

async function main() {
  const { bytes, manifest, sha256 } = await loadManifest();
  const summary = validateManifest(manifest);
  process.stdout.write(`${JSON.stringify({ ...summary, bytes: bytes.length, sha256 }, null, 2)}\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await main();
}
