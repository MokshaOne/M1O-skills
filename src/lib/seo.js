/**
 * Auto-SEO Generator
 * Derives SEO metadata from content entries automatically.
 * Manual overrides (seo_title, seo_description, seo_image_id) take precedence.
 */

/**
 * Strip HTML tags and collapse whitespace.
 */
function stripHtml(html) {
  if (!html) return '';
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Find the first text-like value in content data for description.
 */
function findDescriptionText(data, fields) {
  // Priority: fields typed richtext > textarea > text, by position
  const priority = ['richtext', 'textarea', 'text'];
  for (const type of priority) {
    const field = fields.find(f => f.type === type && f.key !== 'title');
    if (field && data[field.key]) {
      return stripHtml(String(data[field.key]));
    }
  }
  // Fallback: first string value that's long enough
  for (const val of Object.values(data)) {
    if (typeof val === 'string' && val.length > 30) {
      return stripHtml(val);
    }
  }
  return '';
}

/**
 * Find the first media reference in content data for OG image.
 */
function findOgImage(data, fields) {
  const mediaField = fields.find(f => f.type === 'media');
  if (!mediaField) return null;
  const val = data[mediaField.key];
  // Could be a UUID string or an array of UUIDs
  if (typeof val === 'string') return val;
  if (Array.isArray(val) && val.length > 0) return val[0];
  return null;
}

/**
 * Map content type slug to schema.org type.
 */
const SCHEMA_MAP = {
  page: 'WebPage',
  post: 'Article',
  article: 'Article',
  project: 'CreativeWork',
  gallery: 'ImageGallery',
  event: 'Event',
  service: 'Service',
  person: 'Person',
  member: 'Person',
  product: 'Product',
};

/**
 * Generate SEO metadata for a content entry.
 * @param {object} entry - Content entry with data, seo overrides
 * @param {object} contentType - Content type with fields definition
 * @param {object} site - Site with name, domain
 * @param {string} [mediaBaseUrl] - Base URL for media
 */
export function generateSeo(entry, contentType, site, mediaBaseUrl = '') {
  const fields = contentType.fields || [];
  const data = entry.data || {};

  // Title
  const entryTitle = data.title || data.name || entry.slug;
  const title = entry.seo_title || `${entryTitle} — ${site.name}`;

  // Description
  const autoDesc = findDescriptionText(data, fields);
  const description = entry.seo_description ||
    (autoDesc.length > 155 ? autoDesc.slice(0, 152) + '...' : autoDesc);

  // Canonical
  const domain = site.domain ? `https://${site.domain}` : '';
  const canonical = `${domain}/${contentType.slug}/${entry.slug}`;

  // OG image
  const ogImageId = entry.seo_image_id || findOgImage(data, fields);
  const ogImage = ogImageId
    ? `${mediaBaseUrl}/api/v1/${site.slug}/media/${ogImageId}?w=1200&h=630&fit=cover`
    : null;

  // JSON-LD
  const schemaType = SCHEMA_MAP[contentType.slug] || 'Thing';
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': schemaType,
    name: entryTitle,
    description,
    url: canonical,
  };

  if (ogImage) jsonLd.image = ogImage;
  if (entry.published_at) jsonLd.datePublished = entry.published_at;
  if (entry.updated_at) jsonLd.dateModified = entry.updated_at;

  return {
    title,
    description,
    canonical,
    og: {
      title,
      description,
      image: ogImage,
      type: schemaType === 'Article' ? 'article' : 'website',
      url: canonical,
      site_name: site.name,
    },
    jsonLd,
  };
}
