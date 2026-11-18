import { verifyAccessToken } from '../lib/auth.js';
import { query } from '../db/pool.js';
import bcrypt from 'bcrypt';

/**
 * JWT auth middleware for admin routes.
 * Sets req.user = { id, email, role }
 */
export function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing authorization header' });
  }

  try {
    const payload = verifyAccessToken(header.slice(7));
    req.user = { id: payload.sub, email: payload.email, role: payload.role };
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

/**
 * Require super_admin role.
 */
export function requireSuperAdmin(req, res, next) {
  if (req.user?.role !== 'super_admin') {
    return res.status(403).json({ error: 'Super admin required' });
  }
  next();
}

/**
 * Require site access — checks site_users table (super_admin bypasses).
 * Expects req.params.siteId or req.siteId.
 */
export async function requireSiteAccess(req, res, next) {
  const siteId = req.params.siteId || req.siteId;
  if (!siteId) return res.status(400).json({ error: 'Site ID required' });

  if (req.user.role === 'super_admin') {
    req.siteId = siteId;
    return next();
  }

  const { rows } = await query(
    'SELECT role FROM site_users WHERE site_id = $1 AND user_id = $2',
    [siteId, req.user.id]
  );

  if (rows.length === 0) {
    return res.status(403).json({ error: 'No access to this site' });
  }

  req.siteId = siteId;
  req.siteRole = rows[0].role;
  next();
}

/**
 * API key auth for public read endpoints.
 * Sets req.site = { id, slug, name, domain, config }
 */
export async function requireApiKey(req, res, next) {
  const key = req.headers['x-api-key'];
  if (!key) {
    return res.status(401).json({ error: 'Missing X-API-Key header' });
  }

  const prefix = key.slice(0, 12);
  const { rows } = await query(
    `SELECT ak.key_hash, s.id, s.slug, s.name, s.domain, s.config
     FROM api_keys ak
     JOIN sites s ON s.id = ak.site_id
     WHERE ak.key_prefix = $1 AND ak.is_active = true`,
    [prefix]
  );

  for (const row of rows) {
    if (await bcrypt.compare(key, row.key_hash)) {
      req.site = {
        id: row.id,
        slug: row.slug,
        name: row.name,
        domain: row.domain,
        config: row.config,
      };
      return next();
    }
  }

  return res.status(401).json({ error: 'Invalid API key' });
}
