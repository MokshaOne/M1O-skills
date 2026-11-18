import { Router } from 'express';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { query, getClient } from '../db/pool.js';
import { requireAuth, requireSuperAdmin } from '../middleware/authenticate.js';
import { hooks } from '../lib/hooks.js';

const router = Router();

// ==================================================
// SYNC TOKEN MANAGEMENT (admin)
// ==================================================

/** POST /api/sync/tokens — create a sync token */
router.post('/tokens', requireAuth, requireSuperAdmin, async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });

  const token = `m10sync_${crypto.randomBytes(32).toString('hex')}`;
  const tokenHash = await bcrypt.hash(token, 10);

  await query(
    'INSERT INTO sync_tokens (name, token_hash) VALUES ($1, $2)',
    [name, tokenHash]
  );

  // Token shown once — user must save it
  res.status(201).json({ name, token });
});

/** GET /api/sync/tokens — list tokens (no secrets) */
router.get('/tokens', requireAuth, requireSuperAdmin, async (req, res) => {
  const { rows } = await query(
    'SELECT id, name, is_active, created_at FROM sync_tokens ORDER BY created_at'
  );
  res.json(rows);
});

/** DELETE /api/sync/tokens/:id */
router.delete('/tokens/:id', requireAuth, requireSuperAdmin, async (req, res) => {
  const { rows } = await query('DELETE FROM sync_tokens WHERE id = $1 RETURNING id', [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'Token not found' });
  res.status(204).end();
});

// ==================================================
// SYNC TOKEN AUTH MIDDLEWARE
// ==================================================

async function requireSyncToken(req, res, next) {
  const header = req.headers['x-sync-token'];
  if (!header) return res.status(401).json({ error: 'X-Sync-Token header required' });

  const { rows } = await query('SELECT * FROM sync_tokens WHERE is_active = true');
  for (const row of rows) {
    if (await bcrypt.compare(header, row.token_hash)) {
      req.syncToken = row;
      return next();
    }
  }
  return res.status(401).json({ error: 'Invalid sync token' });
}

// ==================================================
// EXPORT — full site dump for NAS pull
// ==================================================

/**
 * GET /api/sync/export/:siteSlug
 * Returns everything needed to reconstruct a site:
 * content types, entries, media metadata, webhooks, api keys
 *
 * Query: ?since=ISO_DATE — incremental export (entries updated after date)
 */
router.get('/export/:siteSlug', requireSyncToken, async (req, res) => {
  const { since } = req.query;

  // Find site
  const { rows: siteRows } = await query('SELECT * FROM sites WHERE slug = $1', [req.params.siteSlug]);
  if (!siteRows.length) return res.status(404).json({ error: 'Site not found' });
  const site = siteRows[0];

  // Log export
  const { rows: [logEntry] } = await query(
    `INSERT INTO sync_log (action, details) VALUES ('export', $1) RETURNING id`,
    [JSON.stringify({ site: site.slug, since: since || null, token: req.syncToken.name })]
  );

  try {
    // Content types
    const { rows: contentTypes } = await query(
      'SELECT * FROM content_types WHERE site_id = $1 ORDER BY position',
      [site.id]
    );

    // Entries (full or incremental)
    let entriesQuery = 'SELECT * FROM content_entries WHERE site_id = $1';
    const entriesParams = [site.id];
    if (since) {
      entriesQuery += ' AND updated_at > $2';
      entriesParams.push(since);
    }
    entriesQuery += ' ORDER BY position ASC, created_at ASC';
    const { rows: entries } = await query(entriesQuery, entriesParams);

    // Media metadata (not the files — those sync via volume mount or separate download)
    let mediaQuery = 'SELECT * FROM media WHERE site_id = $1';
    const mediaParams = [site.id];
    if (since) {
      mediaQuery += ' AND updated_at > $2';
      mediaParams.push(since);
    }
    mediaQuery += ' ORDER BY created_at';
    const { rows: media } = await query(mediaQuery, mediaParams);

    // Webhooks
    const { rows: webhooksData } = await query(
      'SELECT id, url, events, is_active, created_at FROM webhooks WHERE site_id = $1',
      [site.id]
    );

    // Complete
    await query(
      `UPDATE sync_log SET status = 'completed', finished_at = now(),
       details = details || $1 WHERE id = $2`,
      [JSON.stringify({ entries: entries.length, contentTypes: contentTypes.length, media: media.length }), logEntry.id]
    );

    res.json({
      exported_at: new Date().toISOString(),
      incremental: !!since,
      site: { id: site.id, name: site.name, slug: site.slug, domain: site.domain, settings: site.settings },
      content_types: contentTypes,
      entries,
      media,
      webhooks: webhooksData,
    });
  } catch (err) {
    await query(
      `UPDATE sync_log SET status = 'failed', finished_at = now(),
       details = details || $1 WHERE id = $2`,
      [JSON.stringify({ error: err.message }), logEntry.id]
    );
    throw err;
  }
});

// ==================================================
// IMPORT — push data into a site (NAS → CMS or CMS → CMS)
// ==================================================

/**
 * POST /api/sync/import/:siteSlug
 * Upserts everything from an export payload.
 * Idempotent — same payload can be pushed repeatedly.
 *
 * Body: same shape as export response
 */
router.post('/import/:siteSlug', requireSyncToken, async (req, res) => {
  const { content_types, entries, media } = req.body;

  // Find or create site
  let { rows: siteRows } = await query('SELECT * FROM sites WHERE slug = $1', [req.params.siteSlug]);
  if (!siteRows.length) {
    if (!req.body.site) return res.status(404).json({ error: 'Site not found and no site data provided' });
    const s = req.body.site;
    const { rows } = await query(
      'INSERT INTO sites (name, slug, domain, settings) VALUES ($1,$2,$3,$4) RETURNING *',
      [s.name, s.slug, s.domain || null, s.settings || {}]
    );
    siteRows = rows;
  }
  const site = siteRows[0];

  const { rows: [logEntry] } = await query(
    `INSERT INTO sync_log (action, details) VALUES ('import', $1) RETURNING id`,
    [JSON.stringify({ site: site.slug, token: req.syncToken.name })]
  );

  const client = await getClient();
  const stats = { content_types: 0, entries: 0, media: 0, errors: [] };

  try {
    await client.query('BEGIN');

    // Upsert content types (match by id, fallback to slug)
    if (content_types?.length) {
      for (const ct of content_types) {
        await client.query(
          `INSERT INTO content_types (id, site_id, name, slug, description, fields, settings, permissions, position, created_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
           ON CONFLICT (id) DO UPDATE SET
             name = EXCLUDED.name, fields = EXCLUDED.fields,
             settings = EXCLUDED.settings, permissions = EXCLUDED.permissions,
             position = EXCLUDED.position, updated_at = EXCLUDED.updated_at`,
          [ct.id, site.id, ct.name, ct.slug, ct.description || null,
           JSON.stringify(ct.fields), ct.settings || {}, ct.permissions || {},
           ct.position || 0, ct.created_at, ct.updated_at]
        );
        stats.content_types++;
      }
    }

    // Upsert entries
    if (entries?.length) {
      for (const e of entries) {
        await client.query(
          `INSERT INTO content_entries
             (id, content_type_id, site_id, owner_id, title, slug, data, seo_title, seo_description, seo_image_id, status, published_at, position, created_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
           ON CONFLICT (id) DO UPDATE SET
             title = EXCLUDED.title, slug = EXCLUDED.slug, data = EXCLUDED.data,
             seo_title = EXCLUDED.seo_title, seo_description = EXCLUDED.seo_description,
             seo_image_id = EXCLUDED.seo_image_id, status = EXCLUDED.status,
             published_at = EXCLUDED.published_at, position = EXCLUDED.position,
             updated_at = EXCLUDED.updated_at`,
          [e.id, e.content_type_id, site.id, e.owner_id || null,
           e.title, e.slug, JSON.stringify(e.data),
           e.seo_title || null, e.seo_description || null, e.seo_image_id || null,
           e.status, e.published_at || null, e.position || 0,
           e.created_at, e.updated_at]
        );
        stats.entries++;
      }
    }

    // Upsert media metadata
    if (media?.length) {
      for (const m of media) {
        await client.query(
          `INSERT INTO media
             (id, site_id, uploaded_by, filename, original_name, mime_type, size, width, height, alt_text, title, description, exif, created_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
           ON CONFLICT (id) DO UPDATE SET
             alt_text = EXCLUDED.alt_text, title = EXCLUDED.title,
             description = EXCLUDED.description, updated_at = EXCLUDED.updated_at`,
          [m.id, site.id, m.uploaded_by || null,
           m.filename, m.original_name, m.mime_type, m.size,
           m.width || null, m.height || null,
           m.alt_text || null, m.title || null, m.description || null,
           m.exif ? JSON.stringify(m.exif) : null,
           m.created_at, m.updated_at]
        );
        stats.media++;
      }
    }

    await client.query('COMMIT');

    await query(
      `UPDATE sync_log SET status = 'completed', finished_at = now(), details = details || $1 WHERE id = $2`,
      [JSON.stringify(stats), logEntry.id]
    );

    await hooks.run('sync.imported', { site, stats });

    res.json({ ok: true, stats });
  } catch (err) {
    await client.query('ROLLBACK');
    await query(
      `UPDATE sync_log SET status = 'failed', finished_at = now(), details = details || $1 WHERE id = $2`,
      [JSON.stringify({ error: err.message }), logEntry.id]
    );
    throw err;
  } finally {
    client.release();
  }
});

// ==================================================
// FULL SYNC — bidirectional state comparison
// ==================================================

/**
 * POST /api/sync/diff/:siteSlug
 * Client sends its entry IDs + updated_at timestamps.
 * Server responds with what's newer on each side.
 * Client then pulls/pushes only what changed.
 */
router.post('/diff/:siteSlug', requireSyncToken, async (req, res) => {
  const { entries: clientEntries = [] } = req.body;

  const { rows: siteRows } = await query('SELECT * FROM sites WHERE slug = $1', [req.params.siteSlug]);
  if (!siteRows.length) return res.status(404).json({ error: 'Site not found' });
  const site = siteRows[0];

  // Get server entries
  const { rows: serverEntries } = await query(
    'SELECT id, updated_at FROM content_entries WHERE site_id = $1',
    [site.id]
  );

  const serverMap = new Map(serverEntries.map((e) => [e.id, e.updated_at]));
  const clientMap = new Map(clientEntries.map((e) => [e.id, e.updated_at]));

  const serverNewer = []; // IDs where server is newer → client should pull
  const clientNewer = []; // IDs where client is newer → client should push
  const serverOnly = [];  // only on server → client should pull
  const clientOnly = [];  // only on client → client should push

  for (const [id, serverDate] of serverMap) {
    const clientDate = clientMap.get(id);
    if (!clientDate) {
      serverOnly.push(id);
    } else if (new Date(serverDate) > new Date(clientDate)) {
      serverNewer.push(id);
    }
  }

  for (const [id, clientDate] of clientMap) {
    const serverDate = serverMap.get(id);
    if (!serverDate) {
      clientOnly.push(id);
    } else if (new Date(clientDate) > new Date(serverDate)) {
      clientNewer.push(id);
    }
  }

  res.json({
    pull: [...serverOnly, ...serverNewer],   // client fetches these from /export
    push: [...clientOnly, ...clientNewer],     // client sends these to /import
    in_sync: serverEntries.length - serverOnly.length - serverNewer.length,
  });
});

/** GET /api/sync/log — sync history */
router.get('/log', requireAuth, requireSuperAdmin, async (req, res) => {
  const { rows } = await query(
    'SELECT * FROM sync_log ORDER BY started_at DESC LIMIT 50'
  );
  res.json(rows);
});

export default router;
