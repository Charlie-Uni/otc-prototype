import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(SCRIPT_DIR, '..');
const MANIFEST_PATH = resolve(ROOT, 'spec/scenarios.v1.json');
const OUTPUT_PATH = resolve(ROOT, 'contracts/test/M0Differential.t.sol');

const manifestBytes = await readFile(MANIFEST_PATH);
const manifest = JSON.parse(manifestBytes);
const manifestHash = createHash('sha256').update(manifestBytes).digest('hex');

const actorConstants = {
  admin: 'ADMIN',
  manager: 'MANAGER',
  subscriptionOperator: 'SUBSCRIPTION_OPERATOR',
  redemptionOperator: 'REDEMPTION_OPERATOR',
  pauser: 'PAUSER',
  operator2: 'OPERATOR_2',
  transferOperator: 'TRANSFER_OPERATOR',
  alice: 'ALICE',
  bob: 'BOB',
  stranger: 'STRANGER',
};

const constantExpressions = {
  fundId: 'FUND_ID',
  aliceVcHash: `bytes32(${manifest.constants.aliceVcHash})`,
  bobVcHash: `bytes32(${manifest.constants.bobVcHash})`,
  initialNavPayloadHash: `bytes32(${manifest.constants.initialNavPayloadHash})`,
  formulaNav1PayloadHash: `bytes32(${manifest.constants.formulaNav1PayloadHash})`,
  formulaNav2PayloadHash: `bytes32(${manifest.constants.formulaNav2PayloadHash})`,
  navCorrectionPayloadHash: `bytes32(${manifest.constants.navCorrectionPayloadHash})`,
  delayReasonHash: `bytes32(${manifest.constants.delayReasonHash})`,
  initialNav: manifest.constants.initialNav,
  highNav: manifest.constants.highNav,
  subscriptionAmount: manifest.constants.subscriptionAmount,
  redemptionAmount: manifest.constants.redemptionAmount,
};

const roles = {
  DEFAULT_ADMIN_ROLE: 'DEFAULT_ADMIN_ROLE',
  MANAGER_ROLE: 'MANAGER_ROLE',
  SUBSCRIPTION_ROLE: 'SUBSCRIPTION_ROLE',
  REDEMPTION_ROLE: 'REDEMPTION_ROLE',
  PAUSER_ROLE: 'PAUSER_ROLE',
};

function scalar(value, key = '') {
  if (typeof value === 'boolean') return String(value);
  if (typeof value === 'number') return String(value);
  if (typeof value !== 'string') throw new Error(`unsupported scalar ${JSON.stringify(value)}`);
  if (value.startsWith('$')) {
    const expression = constantExpressions[value.slice(1)];
    if (!expression) throw new Error(`unknown constant ${value}`);
    return expression;
  }
  if (actorConstants[value]) return actorConstants[value];
  if (roles[value]) return roles[value];
  if (/^[0-9]+$/.test(value)) return value;
  if (key === 'contract') return value;
  throw new Error(`unsupported scalar ${key}=${value}`);
}

function targetFor(call, args) {
  if (call === 'postInitialNAV' || call === 'postNAV') return 'Target.NAVRegistry';
  if ((call === 'grantRole' || call === 'revokeRole') && args.contract === 'NAVRegistry') {
    return 'Target.NAVRegistry';
  }
  return 'Target.FundToken';
}

function callDataFor(call, args) {
  const s = (key) => scalar(args[key], key);
  switch (call) {
    case 'setWhitelisted':
      return `abi.encodeWithSignature("setWhitelisted(address,bool,bytes32)", ${s('investor')}, ${s('eligible')}, ${s('vcHash')})`;
    case 'postInitialNAV':
      return `abi.encodeWithSignature("postInitialNAV(bytes32,uint256,uint64,bytes32)", ${s('fundId')}, ${s('initialNav')}, uint64(GENESIS_TIMESTAMP + ${s('asOfSec')}), ${s('payloadHash')})`;
    case 'postNAV':
      return `abi.encodeWithSignature("postNAV(bytes32,uint256,uint256,uint64,bytes32)", ${s('fundId')}, ${s('netAssetValue')}, ${s('totalSharesSnapshot')}, uint64(GENESIS_TIMESTAMP + ${s('asOfSec')}), ${s('payloadHash')})`;
    case 'requestSubscription':
      return `abi.encodeWithSignature("requestSubscription(uint256)", ${s('subscriptionAmount')})`;
    case 'requestSubscriptionFor':
      return `abi.encodeWithSignature("requestSubscriptionFor(address,uint256)", ${s('investor')}, ${s('subscriptionAmount')})`;
    case 'acceptSubscription':
      return `abi.encodeWithSignature("acceptSubscription(uint256)", ${s('requestId')})`;
    case 'transfer':
      return `abi.encodeWithSignature("transfer(address,uint256)", ${s('to')}, ${s('amount')})`;
    case 'requestRedemption':
      return `abi.encodeWithSignature("requestRedemption(uint256)", ${s('redeemedShares')})`;
    case 'requestRedemptionFor':
      return `abi.encodeWithSignature("requestRedemptionFor(address,uint256)", ${s('investor')}, ${s('redeemedShares')})`;
    case 'flagSettlementDelayed':
      return `abi.encodeWithSignature("flagSettlementDelayed(uint256,bytes32)", ${s('requestId')}, ${s('reasonHash')})`;
    case 'settleRedemption':
      return `abi.encodeWithSignature("settleRedemption(uint256)", ${s('requestId')})`;
    case 'pause':
      return 'abi.encodeWithSignature("pause()")';
    case 'unpause':
      return 'abi.encodeWithSignature("unpause()")';
    case 'grantRole':
      return `abi.encodeWithSignature("grantRole(bytes32,address)", ${s('role')}, ${s('account')})`;
    case 'revokeRole':
      return `abi.encodeWithSignature("revokeRole(bytes32,address)", ${s('role')}, ${s('account')})`;
    case 'approve':
      return `abi.encodeWithSignature("approve(address,uint256)", ${s('spender')}, ${s('amount')})`;
    case 'transferFrom':
      return `abi.encodeWithSignature("transferFrom(address,address,uint256)", ${s('from')}, ${s('to')}, ${s('amount')})`;
    default:
      throw new Error(`unsupported call ${call}`);
  }
}

function flattenFixture(name, visiting = new Set()) {
  if (visiting.has(name)) throw new Error(`fixture cycle at ${name}`);
  const fixture = manifest.fixtures[name];
  if (!fixture) throw new Error(`unknown fixture ${name}`);
  const next = new Set(visiting).add(name);
  return [
    ...(fixture.extends ? flattenFixture(fixture.extends, next) : []),
    ...fixture.steps,
  ];
}

const fixtureNames = Object.keys(manifest.fixtures);
const fixtureIds = new Map(fixtureNames.map((name, index) => [name, index]));

function fixtureFunction(name, id) {
  const steps = flattenFixture(name).filter((step) => !step.call.startsWith('deploy') && step.atSec > 48);
  const body = steps.map((step) => {
    const target = targetFor(step.call, step.args);
    const caller = scalar(step.caller, 'caller');
    return `            _mustCallAt(${step.atSec}, ${target}, ${caller}, ${callDataFor(step.call, step.args)});`;
  }).join('\n');
  return `        if (fixtureId == ${id}) {\n${body}${body ? '\n' : ''}            return;\n        }`;
}

function expectedRevert(scenario) {
  const expected = scenario.baselineExpected;
  if (expected.outcome === 'accept') return 'bytes("")';
  if (expected.errorKind === 'string') {
    return `abi.encodeWithSignature("Error(string)", "${expected.errorCode}")`;
  }
  if (expected.errorKind === 'customError' && expected.errorCode === 'AccessControlUnauthorizedAccount') {
    const [actor, role] = expected.errorArgs;
    return `abi.encodeWithSelector(bytes4(keccak256("AccessControlUnauthorizedAccount(address,bytes32)")), ${actorConstants[actor]}, ${roles[role]})`;
  }
  throw new Error(`unsupported baseline error for ${scenario.id}`);
}

function scenarioTest(scenario) {
  const target = targetFor(scenario.action.call, scenario.action.args);
  const caller = scalar(scenario.action.caller, 'caller');
  const fixtureId = fixtureIds.get(scenario.fixture);
  return `    function testM0_${scenario.id}() public {\n        _assertM0(\n            Scenario({\n                id: bytes32("${scenario.id}"),\n                fixtureId: ${fixtureId},\n                target: ${target},\n                caller: ${caller},\n                actionData: ${callDataFor(scenario.action.call, scenario.action.args)},\n                actionAtSec: ${scenario.actionAtSec},\n                shouldAccept: ${scenario.baselineExpected.outcome === 'accept'},\n                expectedRevert: ${expectedRevert(scenario)}\n            })\n        );\n    }`;
}

const unformattedOutput = `// SPDX-License-Identifier: MIT
// Generated from scenarios.v1.json; do not edit by hand.
// Manifest-SHA256: ${manifestHash}
pragma solidity ^0.8.30;

import {M0DifferentialHarness} from "./M0DifferentialHarness.sol";

contract M0DifferentialTest is M0DifferentialHarness {
    function _applyFixture(uint8 fixtureId) internal override {
${fixtureNames.map(fixtureFunction).join(' else ')}
        revert("UNKNOWN_FIXTURE");
    }

${manifest.scenarios.map(scenarioTest).join('\n\n')}
}
`;

const formatResult = spawnSync('forge', ['fmt', '--raw', '-'], {
  cwd: resolve(ROOT, 'contracts'),
  encoding: 'utf8',
  input: unformattedOutput,
});
if (formatResult.status !== 0) {
  throw new Error(`forge fmt failed: ${formatResult.stderr || formatResult.stdout}`);
}
const output = formatResult.stdout;

const mode = process.argv[2] ?? '--write';
if (mode === '--write') {
  await writeFile(OUTPUT_PATH, output);
  process.stdout.write(`${JSON.stringify({ status: 'written', scenarios: manifest.scenarios.length, manifestHash })}\n`);
} else if (mode === '--check') {
  const existing = await readFile(OUTPUT_PATH, 'utf8');
  if (existing !== output) throw new Error('M0Differential.t.sol is stale');
  process.stdout.write(`${JSON.stringify({ status: 'verified', scenarios: manifest.scenarios.length, manifestHash })}\n`);
} else {
  throw new Error(`unknown mode ${mode}`);
}
