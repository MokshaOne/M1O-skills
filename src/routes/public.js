import { Router } from 'express';
import { query } from '../db/pool.js';
import { requireApiKey } from '../middleware/authenticate.js';
import { generateSeo } from '../lib/seo.js';
import { hooks } from '../lib/hooks.js';

const router = Router();

/**
 * Public read API — authenticated via X-API-Key
 * GET /api/v1/:siteSlug/:typeSlug
 * GET /api/v1/:siteSlug/:typeSlug/:entrySlug
 * GET /api/v1/:siteSlug/sitemap.json
 */

/** GET /api/v1/:siteSlug/sitemap.json — all published entries for sitemap generation */
router.get('/:siteSlug/sitemap.json', requireApiKey, async (req, res) => {
  const { rows } = await query(
    `SELECT ce.slug, ce.updated_at, ct.slug AS type_slug
     FROM content_entries ce
     JOIN content_types ct ON ct.id = ce.content_type_id
     WHERE ce.site_id = $1 AND ce.status = 'published'
     ORDER BY ce.published_at DESC`,
    [req.site.id]
  );

  const baseUrl = req.site.domain
    ? `https://${req.site.domain}`
    : `https://${req.site.slug}.m1o.at`;

  const urls = rows.map((r) => ({
    loc: `${baseUrl}/${r.type_slug}/${r.slug}`,
    lastmod: r.updated_at,
  }));

  res.json({ urls });
});

/** GET /api/v1/:siteSlug/:typeSlug — list published entries */
router.get('/:siteSlug/:typeSlug', requireApiKey, async (req, res) => {
  const { limit = 25, offset = 0 } = req.query;

  // Get content type
  const { rows: ctRows } = await query(
    'SELECT * FROM content_types WHERE slug = $1 AND site_id = $2',
    [req.params.typeSlug, req.site.id]
  );
  if (!ctRows.length) return res.status(404).json({ error: 'Content type not found' });

  const contentType = ctRows[0];

  const { rows } = await query(
    `SELECT * FROM content_entries
     WHERE content_type_id = $1 AND site_id = $2 AND status = 'published'
     ORDER BY position ASC, published_at DESC
     LIMIT $3 OFFSET $4`,
    [contentType.id, req.site.id, Number(limit), Number(offset)]
  );

  const { rows: countRows } = await query(
    `SELECT count(*)::int AS total FROM content_entries
     WHERE content_type_id = $1 AND site_id = $2 AND status = 'published'`,
    [contentType.id, req.site.id]
  );

  const mediaBaseUrl = `${req.protocol}://${req.get('host')}/media`;

  // Attach auto-SEO to each entry
  const entries = await Promise.all(
    rows.map(async (entry) => {
      const seo = generateSeo(entry, contentType, req.site, mediaBaseUrl);
      const filtered = await hooks.filter('public.entry', { ...entry, seo }, { contentType });
      return filtered;
    })
  );

  res.json({ entries, total: countRows[0].total, contentType: { name: contentType.name, slug: contentType.slug } });
});

/** GET /api/v1/:siteSlug/:typeSlug/:entrySlug — single published entry */
router.get('/:siteSlug/:typeSlug/:entrySlug', requireApiKey, async (req, res) => {
  const { rows: ctRows } = await query(
    'SELECT * FROM content_types WHERE slug = $1 AND site_id = $2',
    [req.params.typeSlug, req.site.id]
  );
  if (!ctRows.length) return res.status(404).json({ error: 'Content type not found' });

  const contentType = ctRows[0];

  const { rows } = await query(
    `SELECT * FROM content_entries
     WHERE slug = $1 AND content_type_id = $2 AND site_id = $3 AND status = 'published'`,
    [req.params.entrySlug, contentType.id, req.site.id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Entry not found' });

  const mediaBaseUrl = `${req.protocol}://${req.get('host')}/media`;
  const entry = rows[0];
  const seo = generateSeo(entry, contentType, req.site, mediaBaseUrl);

  const result = await hooks.filter('public.entry', { ...entry, seo }, { contentType });

  res.json(result);
});

export default router;
