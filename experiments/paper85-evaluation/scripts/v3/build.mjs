import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { viem } from './common.mjs';
import { ROOT, digest, save } from './evidence.mjs';

// Independently compile the artifact's literal sources/settings with the pinned
// compiler. Comparing creation AND runtime bytecode rejects stale/mixed output.
export function assertBuild(artifact, compiled, name) {
  for (const [field, expected] of [['bytecode', artifact.bytecode.object], ['deployedBytecode', artifact.deployedBytecode.object]]) {
    if (`0x${compiled.evm[field].object}` !== expected) throw new Error(`${name}: ${field} does not match source compilation`);
  }
}

export async function buildEvidence(dir, solc) {
  const version = execFileSync(solc, ['--version']).toString();
  if (!version.includes('0.8.30+commit.73712a01')) throw new Error(`Unpinned solc: ${version}`);
  await save(resolve(dir, 'build/compiler.json'), { path: solc, sha256: digest(await readFile(solc)), version });
  for (const [folder, names] of [['contracts', ['FundToken', 'NAVRegistry', 'RiskRegistry']],
    ['experiments/paper85-evaluation/baselines', ['B1TokenOnly', 'B2PermissionedAllowlist']]]) {
    const cwd = resolve(ROOT, folder);
    const command = ['build', '--force', '--use', solc, '--evm-version', 'osaka', '--optimize', 'false', '--optimizer-runs', '200'];
    const output = execFileSync('forge', command, { cwd, maxBuffer: 20_000_000 }).toString();
    await save(resolve(dir, `build/${names[0]}-forge.json`), { command, output,
      config: JSON.parse(execFileSync('forge', ['config', '--json'], { cwd }).toString()),
      forge: execFileSync('forge', ['--version']).toString(), anvil: execFileSync('anvil', ['--version']).toString() });
    for (const name of names) {
      const artifact = JSON.parse(await readFile(resolve(cwd, `out/${name}.sol/${name}.json`)));
      const metadata = artifact.metadata;
      if (metadata.settings.evmVersion !== 'osaka' || metadata.settings.optimizer.enabled || metadata.settings.optimizer.runs !== 200
        || metadata.settings.metadata.bytecodeHash !== 'ipfs') throw new Error(`${name}: compiler settings changed`);
      const sources = {};
      for (const [path, source] of Object.entries(metadata.sources)) {
        const content = await readFile(resolve(cwd, path), 'utf8');
        if (viem.keccak256(viem.stringToHex(content)) !== source.keccak256) throw new Error(`${name}: source differs from artifact: ${path}`);
        sources[path] = { content };
      }
      const settings = structuredClone(metadata.settings);
      const target = Object.keys(settings.compilationTarget)[0];
      delete settings.compilationTarget;
      settings.outputSelection = { '*': { '*': ['abi', 'evm.bytecode', 'evm.deployedBytecode', 'metadata'] } };
      const input = { language: 'Solidity', sources, settings };
      const compiled = JSON.parse(execFileSync(solc, ['--standard-json'], { input: JSON.stringify(input), maxBuffer: 50_000_000 }).toString());
      if (compiled.errors?.some((e) => e.severity === 'error')) throw new Error(JSON.stringify(compiled.errors));
      assertBuild(artifact, compiled.contracts[target][name], name);
      await save(resolve(dir, `build/${name}.input.json.gz`), input);
      await save(resolve(dir, `build/${name}.output.json.gz`), compiled);
      await save(resolve(dir, `build/${name}.artifact.json`), artifact);
    }
  }
}
