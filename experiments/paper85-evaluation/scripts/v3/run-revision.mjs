// One complete, isolated evidence suite. No resume/overwrite of old output.
// Usage: node run-revision.mjs /absolute/path/to/solc-0.8.30
import { spawn } from 'node:child_process';
import { readFile, readdir, unlink, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import { buildEvidence } from './build.mjs';
import { ROOT, prepareRun, save, sealRun } from './evidence.mjs';
import { verifyRun } from './verify-run.mjs';

async function run(script, dir) {
  await new Promise((accept, reject) => {
    const child = spawn(process.execPath, [resolve(ROOT, `experiments/paper85-evaluation/scripts/v3/${script}`)],
      { cwd: ROOT, env: { ...process.env, PAPER85_RUN_DIR: dir }, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    for (const stream of [child.stdout, child.stderr]) stream.on('data', (chunk) => { output += chunk; process.stdout.write(chunk); });
    child.on('error', reject);
    child.on('close', async (code) => {
      await save(resolve(dir, `console/${script}.json`), { code, output });
      code === 0 ? accept() : reject(new Error(`${script}: exit ${code}`));
    });
  });
}

if (!process.argv[2]) throw new Error('Provide the pinned solc 0.8.30 executable path');
const dir = await prepareRun();
console.log(`Evidence run: ${dir}`);
try {
  await buildEvidence(dir, resolve(process.argv[2]));
  // Sequential execution keeps measured replay/fetch intervals free of other
  // runners in this suite. Background host activity remains uncontrolled.
  for (const script of ['run-baselines.mjs', 'run-case.mjs', 'probe-next-nav.mjs', 'probe-revoked-transfer.mjs', 'run-scale.mjs']) await run(script, dir);
  for (const name of await readdir(resolve(dir, 'chains'))) {
    const path = resolve(dir, 'chains', name);
    await writeFile(`${path}.gz`, gzipSync(await readFile(path)), { flag: 'wx' });
    await unlink(path);
  }
  await save(resolve(dir, 'verification.json'), await verifyRun(dir, { sealed: false }));
  await sealRun(dir);
  console.log(`Sealed and independently replayed: ${dir}`);
} catch (error) {
  await save(resolve(dir, 'FAILED.json'), { error: String(error), at: new Date().toISOString() });
  throw error;
}
