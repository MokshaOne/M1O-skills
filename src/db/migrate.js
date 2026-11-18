import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import 'dotenv/config';
import pool from './pool.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function migrate() {
  console.log('[migrate] Running schema migration...');
  const sql = readFileSync(join(__dirname, 'schema.sql'), 'utf-8');
  try {
    await pool.query(sql);
    console.log('[migrate] Schema applied successfully.');
  } catch (err) {
    console.error('[migrate] Failed:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

migrate();
