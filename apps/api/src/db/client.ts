import { Pool } from 'pg';
import { ENV } from '../env';
export const db = new Pool({ connectionString: ENV.DATABASE_URL });