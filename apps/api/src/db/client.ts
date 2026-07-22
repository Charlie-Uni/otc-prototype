import { readFile } from 'node:fs/promises';
import { Pool } from 'pg';
import { ENV } from '../env';

export const db = new Pool({ connectionString: ENV.DATABASE_URL });

export async function initializeDatabase(): Promise<void> {
  if (!ENV.DATABASE_URL) return;
  const schema = await readFile(new URL('./schema.sql', import.meta.url), 'utf8');
  await db.query(schema);
}
