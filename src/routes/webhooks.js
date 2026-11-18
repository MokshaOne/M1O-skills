import { Router } from 'express';
import crypto from 'crypto';
import { query } from '../db/pool.js';
import { requireAuth, requireSiteAccess } from '../middleware/authenticate.js';
import { hooks } from '../lib/hooks.js';

const router = Router();

router.use(requireAuth);

/** GET /api/sites/:siteId/webhooks */
router.get('/sites/:siteId/webhooks', requireSiteAccess, async (req, res) => {
  const { rows } = await query(
    'SELECT id, site_id, url, events, is_active, created_at FROM webhooks WHERE site_id = $1 ORDER BY created_at',
    [req.params.siteId]
  );
  res.json(rows);
});

/** POST /api/sites/:siteId/webhooks */
router.post('/sites/:siteId/webhooks', requireSiteAccess, async (req, res) => {
  const { url, events } = req.body;
  if (!url || !events?.length) {
    return res.status(400).json({ error: 'url and events[] required' });
  }

  const secret = crypto.randomBytes(32).toString('hex');

  const { rows } = await query(
    `INSERT INTO webhooks (site_id, url, events, secret)
     VALUES ($1, $2, $3, $4) RETURNING id, site_id, url, events, is_active, created_at`,
    [req.params.siteId, url, events, secret]
  );

  // Return secret only on creation
  res.status(201).json({ ...rows[0], secret });
});

/** PUT /api/sites/:siteId/webhooks/:id */
router.put('/sites/:siteId/webhooks/:id', requireSiteAccess, async (req, res) => {
  const { url, events, is_active } = req.body;

  const { rows } = await query(
    `UPDATE webhooks SET
       url = COALESCE($1, url),
       events = COALESCE($2, events),
       is_active = COALESCE($3, is_active)
     WHERE id = $4 AND site_id = $5
     RETURNING id, site_id, url, events, is_active, created_at`,
    [url, events, is_active, req.params.id, req.params.siteId]
  );

  if (!rows.length) return res.status(404).json({ error: 'Webhook not found' });
  res.json(rows[0]);
});

/** DELETE /api/sites/:siteId/webhooks/:id */
router.delete('/sites/:siteId/webhooks/:id', requireSiteAccess, async (req, res) => {
  const { rows } = await query(
    'DELETE FROM webhooks WHERE id = $1 AND site_id = $2 RETURNING id',
    [req.params.id, req.params.siteId]
  );
  if (!rows.length) return res.status(404).json({ error: 'Webhook not found' });
  res.status(204).end();
});

export default router;

/**
 * Webhook dispatch — called from hook system
 */
export async function dispatchWebhooks(event, payload) {
  const siteId = payload.site_id || payload.siteId;
  if (!siteId) return;

  const { rows: webhookRows } = await query(
    `SELECT * FROM webhooks WHERE site_id = $1 AND is_active = true AND $2 = ANY(events)`,
    [siteId, event]
  );

  for (const wh of webhookRows) {
    const body = JSON.stringify({ event, payload, timestamp: new Date().toISOString() });
    const signature = crypto.createHmac('sha256', wh.secret).update(body).digest('hex');

    // Fire and forget — don't block on webhook delivery
    fetch(wh.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-M10-Signature': signature,
        'X-M10-Event': event,
      },
      body,
      signal: AbortSignal.timeout(10_000),
    }).catch(() => {
      // Silently fail — webhook delivery is best-effort
    });
  }
}
