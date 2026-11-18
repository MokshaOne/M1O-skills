import { Router } from 'express';
import bcrypt from 'bcrypt';
import { nanoid } from 'nanoid';
import { query } from '../db/pool.js';
import { getInstallState, runMigration, markInstalled } from '../lib/setup.js';
import { signAccessToken, signRefreshToken, storeRefreshToken } from '../lib/auth.js';

const router = Router();

/**
 * Setup guard — every route here returns 403 once installed.
 * Like WordPress's wp-admin/install.php: works once, then locks.
 */
router.use(async (req, res, next) => {
  const state = await getInstallState();
  if (state === 'installed') {
    return res.status(403).json({ error: 'Already installed', installed: true });
  }
  req.installState = state;
  next();
});

/** GET /api/setup/status — what step are we on? */
router.get('/status', (req, res) => {
  const steps = {
    no_database: { step: 1, label: 'Database Setup', description: 'Create tables and indexes' },
    no_admin: { step: 2, label: 'Create Admin', description: 'Set up your administrator account and first site' },
  };
  res.json({
    installed: false,
    state: req.installState,
    ...steps[req.installState],
  });
});

/** POST /api/setup/database — step 1: run migrations */
router.post('/database', async (req, res) => {
  if (req.installState !== 'no_database') {
    return res.json({ ok: true, message: 'Database already initialized' });
  }

  try {
    await runMigration();
    res.json({ ok: true, message: 'Database tables created' });
  } catch (err) {
    res.status(500).json({ error: 'Migration failed', details: err.message });
  }
});

/**
 * POST /api/setup/install — step 2: create admin + first site
 *
 * Body:
 *   email      — admin email (required)
 *   password   — admin password, min 8 chars (required)
 *   name       — admin display name (required)
 *   site_name  — first site name (required)
 *   site_domain — optional domain (e.g. m1o.at)
 */
router.post('/install', async (req, res) => {
  // Auto-run migration if not done yet
  if (req.installState === 'no_database') {
    try {
      await runMigration();
    } catch (err) {
      return res.status(500).json({ error: 'Migration failed', details: err.message });
    }
  }

  const { email, password, name, site_name, site_domain } = req.body;

  // Validate
  const errors = [];
  if (!email) errors.push('email required');
  if (!password || password.length < 8) errors.push('password required (min 8 characters)');
  if (!name) errors.push('name required');
  if (!site_name) errors.push('site_name required');
  if (errors.length) return res.status(400).json({ error: 'Validation failed', details: errors });

  try {
    // Create admin
    const passwordHash = await bcrypt.hash(password, 12);
    const { rows: [admin] } = await query(
      `INSERT INTO users (email, password_hash, name, role)
       VALUES ($1, $2, $3, 'super_admin') RETURNING id, email, name, role`,
      [email, passwordHash, name]
    );

    // Create first site
    const slugify = (await import('slugify')).default;
    const siteSlug = slugify(site_name, { lower: true, strict: true });

    const { rows: [site] } = await query(
      `INSERT INTO sites (name, slug, domain) VALUES ($1, $2, $3) RETURNING *`,
      [site_name, siteSlug, site_domain || null]
    );

    // Link admin to site
    await query(
      `INSERT INTO site_users (site_id, user_id, role) VALUES ($1, $2, 'site_admin')`,
      [site.id, admin.id]
    );

    // Generate API key for the site
    const apiKey = `m10_${nanoid(32)}`;
    const keyHash = await bcrypt.hash(apiKey, 10);
    await query(
      `INSERT INTO api_keys (site_id, name, key_hash, key_prefix)
       VALUES ($1, $2, $3, $4)`,
      [site.id, `${site_name} Public API`, keyHash, apiKey.slice(0, 12)]
    );

    // Auto-login: issue tokens
    const accessToken = signAccessToken(admin);
    const { token: refreshToken, expiresAt } = signRefreshToken(admin);
    await storeRefreshToken(admin.id, refreshToken, expiresAt);

    // Lock installation
    markInstalled();

    res.status(201).json({
      ok: true,
      message: 'M10 CMS installed successfully',
      user: { id: admin.id, email: admin.email, name: admin.name, role: admin.role },
      site: { id: site.id, name: site.name, slug: site.slug, domain: site.domain },
      apiKey, // shown once — user must save it
      accessToken,
      refreshToken,
    });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Email or site slug already exists' });
    }
    throw err;
  }
});

export default router;
