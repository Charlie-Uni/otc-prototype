import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const EXPERIMENT_ROOT = resolve(SCRIPT_DIR, '..');
const REPO_ROOT = resolve(EXPERIMENT_ROOT, '..', '..');

const contracts = [
  {
    production: 'contracts/src/FundToken.sol',
    generated: 'experiments/paper85-evaluation/contracts/generated/ExperimentalFundToken.sol',
  },
  {
    production: 'contracts/src/NAVRegistry.sol',
    generated: 'experiments/paper85-evaluation/contracts/generated/ExperimentalNAVRegistry.sol',
  },
];

function namedGuards(source) {
  const guards = new Set();
  for (const line of source.split('\n')) {
    if (!line.includes('require(') && !line.includes('revert(')) continue;
    for (const match of line.matchAll(/"([A-Z][A-Z0-9_]+)"/g)) guards.add(match[1]);
  }
  return guards;
}

const map = await readFile(join(EXPERIMENT_ROOT, 'spec', 'guard-flag-map.md'), 'utf8');
let total = 0;
for (const contract of contracts) {
  const production = await readFile(join(REPO_ROOT, contract.production), 'utf8');
  const generated = await readFile(join(REPO_ROOT, contract.generated), 'utf8');
  const guards = namedGuards(production);
  total += guards.size;
  for (const guard of guards) {
    if (!map.includes(`\`${guard}\``)) throw new Error(`${contract.production}: ${guard} missing from guard map`);
    if (!generated.includes(`"${guard}"`)) throw new Error(`${contract.generated}: ${guard} missing from generated source`);
  }
}

process.stdout.write(`${JSON.stringify({ status: 'verified', namedGuardCount: total }, null, 2)}\n`);
