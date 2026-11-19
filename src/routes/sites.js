import { Router } from 'express';
import slugify from 'slugify';
import bcrypt from 'bcrypt';
import { nanoid } from 'nanoid';
import { query } from '../db/pool.js';
import { requireAuth, requireSuperAdmin } from '../middleware/authenticate.js';
import { hooks } from '../lib/hooks.js';

const router = Router();

router.use(requireAuth);

/** GET /api/sites — list sites for current user */
router.get('/', async (req, res) => {
  let result;
  if (req.user.role === 'super_admin') {
    result = await query('SELECT * FROM sites ORDER BY name');
  } else {
    result = await query(
      `SELECT s.* FROM sites s
       JOIN site_users su ON su.site_id = s.id
       WHERE su.user_id = $1 ORDER BY s.name`,
      [req.user.id]
    );
  }
  res.json(result.rows);
});

/** GET /api/sites/:id */
router.get('/:id', async (req, res) => {
  const { rows } = await query('SELECT * FROM sites WHERE id = $1', [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'Site not found' });
  res.json(rows[0]);
});

/** POST /api/sites — super_admin only */
router.post('/', requireSuperAdmin, async (req, res) => {
  const { name, domain, settings } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });

  const slug = slugify(name, { lower: true, strict: true });

  const { rows: existing } = await query('SELECT id FROM sites WHERE slug = $1', [slug]);
  if (existing.length) return res.status(409).json({ error: 'Site slug already exists' });

  const { rows } = await query(
    `INSERT INTO sites (name, slug, domain, settings)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [name, slug, domain || null, settings || {}]
  );

  await hooks.run('site.created', rows[0]);
  res.status(201).json(rows[0]);
});

/** PUT /api/sites/:id — super_admin only */
router.put('/:id', requireSuperAdmin, async (req, res) => {
  const { name, domain, settings } = req.body;

  const { rows } = await query(
    `UPDATE sites SET
       name = COALESCE($1, name),
       domain = COALESCE($2, domain),
       settings = COALESCE($3, settings)
     WHERE id = $4 RETURNING *`,
    [name, domain, settings, req.params.id]
  );

  if (!rows.length) return res.status(404).json({ error: 'Site not found' });

  await hooks.run('site.updated', rows[0]);
  res.json(rows[0]);
});

/** POST /api/sites/:id/api-keys — generate a new API key (super_admin only) */
router.post('/:id/api-keys', requireSuperAdmin, async (req, res) => {
  const { name } = req.body;
  const siteId = req.params.id;

  const { rows: siteRows } = await query('SELECT id, name FROM sites WHERE id = $1', [siteId]);
  if (!siteRows.length) return res.status(404).json({ error: 'Site not found' });

  const keyName = name || `${siteRows[0].name} API Key`;
  const apiKey = `m10_${nanoid(32)}`;
  const keyHash = await bcrypt.hash(apiKey, 10);

  await query(
    `INSERT INTO api_keys (site_id, name, key_hash, key_prefix)
     VALUES ($1, $2, $3, $4)`,
    [siteId, keyName, keyHash, apiKey.slice(0, 12)]
  );

  res.status(201).json({ apiKey, name: keyName, prefix: apiKey.slice(0, 12) });
});

/** GET /api/sites/:id/api-keys — list keys for a site (super_admin only) */
router.get('/:id/api-keys', requireSuperAdmin, async (req, res) => {
  const { rows } = await query(
    `SELECT id, name, key_prefix, is_active, created_at FROM api_keys WHERE site_id = $1 ORDER BY created_at`,
    [req.params.id]
  );
  res.json(rows);
});

/** DELETE /api/sites/:id — super_admin only */
router.delete('/:id', requireSuperAdmin, async (req, res) => {
  const { rows } = await query('DELETE FROM sites WHERE id = $1 RETURNING id', [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'Site not found' });

  await hooks.run('site.deleted', { id: req.params.id });
  res.status(204).end();
});

export default router;
