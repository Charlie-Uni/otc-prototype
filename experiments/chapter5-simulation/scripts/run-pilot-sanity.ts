import { readFileSync } from 'node:fs';
import { parseSimulationConfig } from '../src/core/config';
import { runPilotSanity } from '../src/pilot/sanity';

const config = parseSimulationConfig(JSON.parse(readFileSync(
  new URL('../config/pilot-baseline.json', import.meta.url),
  'utf8',
)) as unknown);

process.stdout.write(`${JSON.stringify(runPilotSanity(config), null, 2)}\n`);
