import { Router } from 'express';
import slugify from 'slugify';
import { query, getClient } from '../db/pool.js';
import { requireAuth, requireSiteAccess } from '../middleware/authenticate.js';
import { validateContentData } from '../lib/fields.js';
import { generateSeo } from '../lib/seo.js';
import { hooks } from '../lib/hooks.js';

const router = Router();

router.use(requireAuth);

/** GET /api/sites/:siteId/entries?type=slug&status=published&limit=25&offset=0 */
router.get('/sites/:siteId/entries', requireSiteAccess, async (req, res) => {
  const { type, status, limit = 25, offset = 0 } = req.query;

  let where = 'ce.site_id = $1';
  const params = [req.params.siteId];
  let idx = 2;

  if (type) {
    where += ` AND ct.slug = $${idx++}`;
    params.push(type);
  }
  if (status) {
    where += ` AND ce.status = $${idx++}`;
    params.push(status);
  }

  params.push(Number(limit), Number(offset));

  const { rows } = await query(
    `SELECT ce.*, ct.slug AS content_type_slug, ct.name AS content_type_name
     FROM content_entries ce
     JOIN content_types ct ON ct.id = ce.content_type_id
     WHERE ${where}
     ORDER BY ce.position ASC, ce.created_at DESC
     LIMIT $${idx++} OFFSET $${idx}`,
    params
  );

  const { rows: countRows } = await query(
    `SELECT count(*)::int AS total
     FROM content_entries ce
     JOIN content_types ct ON ct.id = ce.content_type_id
     WHERE ${where}`,
    params.slice(0, -2)
  );

  res.json({ entries: rows, total: countRows[0].total });
});

/** GET /api/sites/:siteId/entries/:id */
router.get('/sites/:siteId/entries/:id', requireSiteAccess, async (req, res) => {
  const { rows } = await query(
    `SELECT ce.*, ct.slug AS content_type_slug, ct.name AS content_type_name,
            ct.fields AS content_type_fields
     FROM content_entries ce
     JOIN content_types ct ON ct.id = ce.content_type_id
     WHERE ce.id = $1 AND ce.site_id = $2`,
    [req.params.id, req.params.siteId]
  );
  if (!rows.length) return res.status(404).json({ error: 'Entry not found' });
  res.json(rows[0]);
});

/** POST /api/sites/:siteId/entries */
router.post('/sites/:siteId/entries', requireSiteAccess, async (req, res) => {
  const { content_type_id, title, data, status, seo_title, seo_description, seo_image_id } = req.body;
  if (!content_type_id || !title) {
    return res.status(400).json({ error: 'content_type_id and title required' });
  }

  // Fetch content type for validation
  const { rows: ctRows } = await query(
    'SELECT * FROM content_types WHERE id = $1 AND site_id = $2',
    [content_type_id, req.params.siteId]
  );
  if (!ctRows.length) return res.status(400).json({ error: 'Invalid content type' });

  const contentType = ctRows[0];

  // Validate data against fields
  if (data) {
    const errors = validateContentData(data, contentType.fields);
    if (errors.length) return res.status(400).json({ error: 'Validation failed', details: errors });
  }

  // Run filter
  const filteredData = await hooks.filter('entry.data.beforeSave', data || {}, {
    contentType,
    siteId: req.params.siteId,
  });

  const slug = slugify(title, { lower: true, strict: true });
  const entryStatus = status || 'draft';
  const publishedAt = entryStatus === 'published' ? new Date().toISOString() : null;

  const { rows } = await query(
    `INSERT INTO content_entries
       (site_id, content_type_id, title, slug, data, status, published_at, owner_id,
        seo_title, seo_description, seo_image_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
    [
      req.params.siteId, content_type_id, title, slug,
      JSON.stringify(filteredData), entryStatus, publishedAt, req.user.id,
      seo_title || null, seo_description || null, seo_image_id || null,
    ]
  );

  await hooks.run('entry.created', rows[0]);
  if (entryStatus === 'published') await hooks.run('entry.published', rows[0]);

  res.status(201).json(rows[0]);
});

/** PUT /api/sites/:siteId/entries/:id */
router.put('/sites/:siteId/entries/:id', requireSiteAccess, async (req, res) => {
  const { title, data, status, seo_title, seo_description, seo_image_id, position } = req.body;

  const client = await getClient();
  try {
    await client.query('BEGIN');

    // Get current entry for versioning
    const { rows: current } = await client.query(
      'SELECT * FROM content_entries WHERE id = $1 AND site_id = $2',
      [req.params.id, req.params.siteId]
    );
    if (!current.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Entry not found' });
    }

    const entry = current[0];

    // Save version
    await client.query(
      `INSERT INTO content_versions (entry_id, data, title, status, version_number)
       SELECT $1, data, title, status, COALESCE(
         (SELECT MAX(version_number) FROM content_versions WHERE entry_id = $1), 0
       ) + 1
       FROM content_entries WHERE id = $1`,
      [req.params.id]
    );

    // Validate new data
    if (data) {
      const { rows: ctRows } = await client.query(
        'SELECT * FROM content_types WHERE id = $1',
        [entry.content_type_id]
      );
      const errors = validateContentData(data, ctRows[0].fields);
      if (errors.length) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Validation failed', details: errors });
      }
    }

    const filteredData = data
      ? await hooks.filter('entry.data.beforeSave', data, { entry })
      : null;

    const newStatus = status || entry.status;
    let publishedAt = entry.published_at;
    if (newStatus === 'published' && entry.status !== 'published') {
      publishedAt = new Date().toISOString();
    }

    const newSlug = title ? slugify(title, { lower: true, strict: true }) : entry.slug;

    const { rows } = await client.query(
      `UPDATE content_entries SET
         title = COALESCE($1, title),
         slug = $2,
         data = COALESCE($3, data),
         status = $4,
         published_at = $5,
         seo_title = COALESCE($6, seo_title),
         seo_description = COALESCE($7, seo_description),
         seo_image_id = COALESCE($8, seo_image_id),
         position = COALESCE($9, position)
       WHERE id = $10 RETURNING *`,
      [
        title, newSlug,
        filteredData ? JSON.stringify(filteredData) : null,
        newStatus, publishedAt,
        seo_title, seo_description, seo_image_id, position,
        req.params.id,
      ]
    );

    await client.query('COMMIT');

    await hooks.run('entry.updated', rows[0]);
    if (newStatus === 'published' && entry.status !== 'published') {
      await hooks.run('entry.published', rows[0]);
    }

    res.json(rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

/** DELETE /api/sites/:siteId/entries/:id */
router.delete('/sites/:siteId/entries/:id', requireSiteAccess, async (req, res) => {
  const { rows } = await query(
    'DELETE FROM content_entries WHERE id = $1 AND site_id = $2 RETURNING id',
    [req.params.id, req.params.siteId]
  );
  if (!rows.length) return res.status(404).json({ error: 'Entry not found' });

  await hooks.run('entry.deleted', { id: req.params.id, siteId: req.params.siteId });
  res.status(204).end();
});

export default router;
