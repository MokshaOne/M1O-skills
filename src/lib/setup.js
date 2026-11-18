import { query } from '../db/pool.js';

/**
 * Installation states:
 *   'no_database'  — tables don't exist yet
 *   'no_admin'     — tables exist but no super_admin user
 *   'installed'    — at least one super_admin exists → CMS is live
 */

let _cachedState = null;

export async function getInstallState() {
  if (_cachedState === 'installed') return 'installed'; // once installed, stays installed

  try {
    const { rows } = await query(
      "SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name = 'users') AS has_users"
    );
    if (!rows[0].has_users) {
      _cachedState = 'no_database';
      return 'no_database';
    }

    const { rows: admins } = await query(
      "SELECT id FROM users WHERE role = 'super_admin' LIMIT 1"
    );
    if (!admins.length) {
      _cachedState = 'no_admin';
      return 'no_admin';
    }

    _cachedState = 'installed';
    return 'installed';
  } catch {
    return 'no_database';
  }
}

export function markInstalled() {
  _cachedState = 'installed';
}

/**
 * Run schema migration programmatically (used during install)
 */
export async function runMigration() {
  const { readFileSync } = await import('fs');
  const { dirname, join } = await import('path');
  const { fileURLToPath } = await import('url');

  // Resolve relative to this file → ../db/schema.sql
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const sql = readFileSync(join(__dirname, '..', 'db', 'schema.sql'), 'utf-8');
  await query(sql);
}
