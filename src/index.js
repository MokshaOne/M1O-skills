import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import 'dotenv/config';

import setupRoutes from './routes/setup.js';
import syncRoutes from './routes/sync.js';
import authRoutes from './routes/auth.js';
import siteRoutes from './routes/sites.js';
import contentTypeRoutes from './routes/contentTypes.js';
import entryRoutes from './routes/entries.js';
import mediaRoutes from './routes/media.js';
import publicRoutes from './routes/public.js';
import webhookRoutes from './routes/webhooks.js';
import { dispatchWebhooks } from './routes/webhooks.js';
import { hooks } from './lib/hooks.js';
import { initMediaDir } from './lib/media.js';
import { cleanExpiredTokens } from './lib/auth.js';
import { getInstallState } from './lib/setup.js';

const app = express();
const PORT = process.env.PORT || 3000;

// Global middleware
app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGINS?.split(',') || '*' }));
app.use(express.json({ limit: '10mb' }));

// Health check (always available)
app.get('/health', (req, res) => res.json({ status: 'ok', version: '1.0.1' }));

// Setup routes (available before install, locked after)
app.use('/api/setup', setupRoutes);

// Install guard — block all other API routes until CMS is installed
app.use('/api', async (req, res, next) => {
  // Allow sync routes with token auth (NAS can sync before user logs in)
  if (req.path.startsWith('/sync')) return next();

  const state = await getInstallState();
  if (state !== 'installed') {
    return res.status(503).json({
      error: 'CMS not installed',
      setup_url: '/api/setup/status',
      install_state: state,
    });
  }
  next();
});

// Sync API (token-authed, independent of user login)
app.use('/api/sync', syncRoutes);

// Public read API (before admin routes — admin routers use global requireAuth
// which would intercept /api/v1/* requests if mounted first)
app.use('/api/v1', publicRoutes);     // /api/v1/:siteSlug/:typeSlug[/:entrySlug]

// Admin API routes
app.use('/api/auth', authRoutes);
app.use('/api/sites', siteRoutes);
app.use('/api', contentTypeRoutes);  // /api/sites/:siteId/content-types
app.use('/api', entryRoutes);         // /api/sites/:siteId/entries
app.use('/api', mediaRoutes);         // /api/sites/:siteId/media + /media/:filename (public)
app.use('/api', webhookRoutes);       // /api/sites/:siteId/webhooks

// Register webhook dispatch on content events
const webhookEvents = [
  'entry.created', 'entry.updated', 'entry.published', 'entry.deleted',
  'media.uploaded', 'media.deleted',
  'contentType.created', 'contentType.updated', 'contentType.deleted',
  'site.created', 'site.updated', 'site.deleted',
  'sync.imported',
];
for (const event of webhookEvents) {
  hooks.on(event, (payload) => dispatchWebhooks(event, payload), 100);
}

// Plugin loader — scans src/plugins/ for index.js files
async function loadPlugins() {
  const { readdir } = await import('fs/promises');
  const { join } = await import('path');
  const pluginsDir = join(import.meta.dirname, 'plugins');

  try {
    const entries = await readdir(pluginsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        try {
          const pluginModule = await import(join(pluginsDir, entry.name, 'index.js'));
          if (typeof pluginModule.default === 'function') {
            await pluginModule.default({ hooks, app });
            console.log(`[plugin] loaded: ${entry.name}`);
          }
        } catch (err) {
          console.error(`[plugin] failed to load ${entry.name}:`, err.message);
        }
      }
    }
  } catch {
    // No plugins directory — that's fine
  }
}

// Global error handler
app.use((err, req, res, _next) => {
  console.error('[error]', err.message);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

// Start
async function start() {
  await initMediaDir();
  await loadPlugins();

  // Clean expired refresh tokens every hour
  setInterval(cleanExpiredTokens, 60 * 60 * 1000);

  app.listen(PORT, () => {
    console.log(`M10 CMS running on port ${PORT}`);
  });
}

start().catch((err) => {
  console.error('Failed to start:', err);
  process.exit(1);
});
