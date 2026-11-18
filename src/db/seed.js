import 'dotenv/config';
import bcrypt from 'bcrypt';
import { nanoid } from 'nanoid';
import pool, { query } from './pool.js';

async function seed() {
  console.log('[seed] Seeding database...');

  // Create super admin
  const passwordHash = await bcrypt.hash('admin', 12);
  const { rows: [admin] } = await query(
    `INSERT INTO users (email, password_hash, name, role)
     VALUES ($1, $2, $3, 'super_admin')
     ON CONFLICT (email) DO NOTHING
     RETURNING id`,
    ['admin@m1o.at', passwordHash, 'Admin']
  );

  if (!admin) {
    console.log('[seed] Admin already exists, skipping.');
    await pool.end();
    return;
  }

  // Create sites
  const sites = [
    { name: 'M1O', slug: 'm1o', domain: 'm1o.at' },
    { name: 'Raveenthiran', slug: 'raveenthiran', domain: 'raveenthiran.com' },
  ];

  for (const site of sites) {
    const { rows: [s] } = await query(
      `INSERT INTO sites (name, slug, domain)
       VALUES ($1, $2, $3)
       ON CONFLICT (slug) DO NOTHING
       RETURNING id`,
      [site.name, site.slug, site.domain]
    );

    if (s) {
      // Link admin to site
      await query(
        `INSERT INTO site_users (site_id, user_id, role)
         VALUES ($1, $2, 'site_admin')`,
        [s.id, admin.id]
      );

      // Generate API key
      const key = `m10_${nanoid(32)}`;
      const keyHash = await bcrypt.hash(key, 10);
      await query(
        `INSERT INTO api_keys (site_id, name, key_hash, key_prefix)
         VALUES ($1, $2, $3, $4)`,
        [s.id, `${site.name} Public`, keyHash, key.slice(0, 12)]
      );

      console.log(`[seed] Site "${site.name}" created. API key: ${key}`);
    }
  }

  console.log('[seed] Done. Admin login: admin@m1o.at / admin');
  await pool.end();
}

seed().catch((err) => {
  console.error('[seed] Failed:', err);
  process.exit(1);
});
