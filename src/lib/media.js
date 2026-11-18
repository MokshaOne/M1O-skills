import { mkdir } from 'fs/promises';
import { join, extname } from 'path';
import sharp from 'sharp';
import exifr from 'exifr';
import { nanoid } from 'nanoid';

const MEDIA_DIR = process.env.MEDIA_DIR || './media';

/** Ensure media directories exist */
export async function initMediaDir() {
  await mkdir(join(MEDIA_DIR, 'originals'), { recursive: true });
  await mkdir(join(MEDIA_DIR, 'transforms'), { recursive: true });
}

/**
 * Process an uploaded file: save original, extract metadata.
 * @returns {{ filename, path, width, height, exif }}
 */
export async function processUpload(file) {
  const ext = extname(file.originalname).toLowerCase() || '.bin';
  const filename = `${nanoid(16)}${ext}`;
  const relativePath = `originals/${filename}`;
  const fullPath = join(MEDIA_DIR, relativePath);

  const isImage = file.mimetype.startsWith('image/');
  let width = null;
  let height = null;
  let exifData = null;

  if (isImage) {
    const image = sharp(file.buffer);
    const meta = await image.metadata();
    width = meta.width;
    height = meta.height;

    // Extract EXIF
    try {
      exifData = await exifr.parse(file.buffer, {
        pick: [
          'Make', 'Model', 'LensModel', 'FocalLength',
          'ExposureTime', 'FNumber', 'ISO',
          'DateTimeOriginal', 'GPSLatitude', 'GPSLongitude',
          'ImageWidth', 'ImageHeight',
        ],
      });
    } catch {
      // No EXIF, that's fine
    }

    // Save with metadata stripped for privacy, keep orientation
    await image.rotate().toFile(fullPath);
  } else {
    // Non-image: write buffer directly
    const { writeFile } = await import('fs/promises');
    await writeFile(fullPath, file.buffer);
  }

  return { filename, path: relativePath, width, height, exif: exifData };
}

/**
 * Get a transformed image buffer.
 * @param {string} originalPath - Relative path to original
 * @param {object} opts - { w, h, fit, quality, format }
 */
export async function getTransform(originalPath, opts = {}) {
  const fullPath = join(MEDIA_DIR, originalPath);
  let image = sharp(fullPath);

  if (opts.w || opts.h) {
    image = image.resize({
      width: opts.w ? parseInt(opts.w) : undefined,
      height: opts.h ? parseInt(opts.h) : undefined,
      fit: opts.fit || 'cover',
      withoutEnlargement: true,
    });
  }

  const format = opts.format || 'webp';
  const quality = opts.quality ? parseInt(opts.quality) : 80;

  switch (format) {
    case 'avif': image = image.avif({ quality }); break;
    case 'png': image = image.png(); break;
    case 'jpg':
    case 'jpeg': image = image.jpeg({ quality }); break;
    default: image = image.webp({ quality });
  }

  return {
    buffer: await image.toBuffer(),
    contentType: `image/${format === 'jpg' ? 'jpeg' : format}`,
  };
}
