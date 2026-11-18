import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import { query } from '../db/pool.js';
import { requireAuth, requireSiteAccess, requireApiKey } from '../middleware/authenticate.js';
import { processUpload, getTransform, initMediaDir } from '../lib/media.js';
import { hooks } from '../lib/hooks.js';

const router = Router();

const MEDIA_DIR = process.env.MEDIA_DIR || './media';

const upload = multer({
  dest: path.join(MEDIA_DIR, 'tmp'),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
});

/** POST /api/sites/:siteId/media — upload */
router.post(
  '/sites/:siteId/media',
  requireAuth,
  requireSiteAccess,
  upload.single('file'),
  async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    await initMediaDir();

    const result = await processUpload(req.file);

    const { rows } = await query(
      `INSERT INTO media
         (site_id, filename, original_name, mime_type, size, width, height, exif, uploaded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [
        req.params.siteId,
        result.filename,
        req.file.originalname,
        result.mimeType,
        result.size,
        result.width || null,
        result.height || null,
        result.exif ? JSON.stringify(result.exif) : null,
        req.user.id,
      ]
    );

    // Clean up tmp
    await fs.unlink(req.file.path).catch(() => {});

    await hooks.run('media.uploaded', rows[0]);
    res.status(201).json(rows[0]);
  }
);

/** GET /api/sites/:siteId/media — list */
router.get('/sites/:siteId/media', requireAuth, requireSiteAccess, async (req, res) => {
  const { limit = 50, offset = 0, mime } = req.query;
  let where = 'site_id = $1';
  const params = [req.params.siteId];
  let idx = 2;

  if (mime) {
    where += ` AND mime_type LIKE $${idx++}`;
    params.push(`${mime}%`);
  }

  params.push(Number(limit), Number(offset));

  const { rows } = await query(
    `SELECT * FROM media WHERE ${where}
     ORDER BY created_at DESC LIMIT $${idx++} OFFSET $${idx}`,
    params
  );

  const { rows: countRows } = await query(
    `SELECT count(*)::int AS total FROM media WHERE ${where}`,
    params.slice(0, -2)
  );

  res.json({ media: rows, total: countRows[0].total });
});

/** DELETE /api/sites/:siteId/media/:id */
router.delete('/sites/:siteId/media/:id', requireAuth, requireSiteAccess, async (req, res) => {
  const { rows } = await query(
    'DELETE FROM media WHERE id = $1 AND site_id = $2 RETURNING filename',
    [req.params.id, req.params.siteId]
  );
  if (!rows.length) return res.status(404).json({ error: 'Media not found' });

  // Delete file from disk
  const filePath = path.join(MEDIA_DIR, 'originals', rows[0].filename);
  await fs.unlink(filePath).catch(() => {});

  await hooks.run('media.deleted', { id: req.params.id });
  res.status(204).end();
});

/**
 * GET /media/:filename — public serve with on-the-fly transforms
 * Query params: w, h, fit (cover|contain|fill|inside|outside), format (webp|avif|jpg|png), q (quality)
 */
router.get('/media/:filename', async (req, res) => {
  const { w, h, fit, format, q } = req.query;
  const originalPath = path.join(MEDIA_DIR, 'originals', req.params.filename);

  try {
    await fs.access(originalPath);
  } catch {
    return res.status(404).json({ error: 'File not found' });
  }

  // No transforms requested — serve original
  if (!w && !h && !format) {
    return res.sendFile(path.resolve(originalPath));
  }

  try {
    const { buffer, contentType } = await getTransform(originalPath, {
      width: w ? Number(w) : undefined,
      height: h ? Number(h) : undefined,
      fit: fit || 'cover',
      format: format || undefined,
      quality: q ? Number(q) : undefined,
    });

    res.set('Content-Type', contentType);
    res.set('Cache-Control', 'public, max-age=31536000, immutable');
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ error: 'Transform failed' });
  }
});

export default router;
