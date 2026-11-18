import { Router } from 'express';
import slugify from 'slugify';
import { query } from '../db/pool.js';
import { requireAuth, requireSiteAccess, requireSuperAdmin } from '../middleware/authenticate.js';
import { hooks } from '../lib/hooks.js';

const router = Router();

router.use(requireAuth);

/** GET /api/sites/:siteId/content-types */
router.get('/sites/:siteId/content-types', requireSiteAccess, async (req, res) => {
  const { rows } = await query(
    'SELECT * FROM content_types WHERE site_id = $1 ORDER BY name',
    [req.params.siteId]
  );
  res.json(rows);
});

/** GET /api/sites/:siteId/content-types/:id */
router.get('/sites/:siteId/content-types/:id', requireSiteAccess, async (req, res) => {
  const { rows } = await query(
    'SELECT * FROM content_types WHERE id = $1 AND site_id = $2',
    [req.params.id, req.params.siteId]
  );
  if (!rows.length) return res.status(404).json({ error: 'Content type not found' });
  res.json(rows[0]);
});

/** POST /api/sites/:siteId/content-types */
router.post('/sites/:siteId/content-types', requireSiteAccess, async (req, res) => {
  const { name, fields, settings, permissions } = req.body;
  if (!name || !fields) {
    return res.status(400).json({ error: 'Name and fields required' });
  }

  const slug = slugify(name, { lower: true, strict: true });

  const { rows: existing } = await query(
    'SELECT id FROM content_types WHERE slug = $1 AND site_id = $2',
    [slug, req.params.siteId]
  );
  if (existing.length) {
    return res.status(409).json({ error: 'Content type slug already exists for this site' });
  }

  // Run filter hook so plugins can modify fields before save
  const filteredFields = await hooks.filter('contentType.fields', fields, { siteId: req.params.siteId });

  const { rows } = await query(
    `INSERT INTO content_types (site_id, name, slug, fields, settings, permissions)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [req.params.siteId, name, slug, JSON.stringify(filteredFields), settings || {}, permissions || {}]
  );

  await hooks.run('contentType.created', rows[0]);
  res.status(201).json(rows[0]);
});

/** PUT /api/sites/:siteId/content-types/:id */
router.put('/sites/:siteId/content-types/:id', requireSiteAccess, async (req, res) => {
  const { name, fields, settings, permissions } = req.body;

  let filteredFields = fields;
  if (fields) {
    filteredFields = await hooks.filter('contentType.fields', fields, {
      siteId: req.params.siteId,
      contentTypeId: req.params.id,
    });
  }

  const { rows } = await query(
    `UPDATE content_types SET
       name = COALESCE($1, name),
       fields = COALESCE($2, fields),
       settings = COALESCE($3, settings),
       permissions = COALESCE($4, permissions)
     WHERE id = $5 AND site_id = $6 RETURNING *`,
    [
      name,
      filteredFields ? JSON.stringify(filteredFields) : null,
      settings,
      permissions,
      req.params.id,
      req.params.siteId,
    ]
  );

  if (!rows.length) return res.status(404).json({ error: 'Content type not found' });

  await hooks.run('contentType.updated', rows[0]);
  res.json(rows[0]);
});

/** DELETE /api/sites/:siteId/content-types/:id */
router.delete('/sites/:siteId/content-types/:id', requireSiteAccess, async (req, res) => {
  const { rows } = await query(
    'DELETE FROM content_types WHERE id = $1 AND site_id = $2 RETURNING id',
    [req.params.id, req.params.siteId]
  );
  if (!rows.length) return res.status(404).json({ error: 'Content type not found' });

  await hooks.run('contentType.deleted', { id: req.params.id, siteId: req.params.siteId });
  res.status(204).end();
});

export default router;
