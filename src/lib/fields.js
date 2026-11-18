/**
 * Field Type Registry
 * Defines available field types for the schema builder.
 * Extensible — plugins can register new types via hooks.
 */

export const FIELD_TYPES = {
  text: {
    name: 'Text',
    description: 'Single-line text input',
    defaultConfig: { maxLength: 255 },
    validate: (val, config) => {
      if (typeof val !== 'string') return 'Must be a string';
      if (config.maxLength && val.length > config.maxLength)
        return `Max ${config.maxLength} characters`;
      return null;
    },
  },
  textarea: {
    name: 'Textarea',
    description: 'Multi-line plain text',
    defaultConfig: {},
    validate: (val) => typeof val !== 'string' ? 'Must be a string' : null,
  },
  richtext: {
    name: 'Rich Text',
    description: 'HTML rich text editor',
    defaultConfig: {},
    validate: (val) => typeof val !== 'string' ? 'Must be a string' : null,
  },
  number: {
    name: 'Number',
    description: 'Integer or decimal number',
    defaultConfig: { min: null, max: null, decimals: 0 },
    validate: (val, config) => {
      if (typeof val !== 'number' || isNaN(val)) return 'Must be a number';
      if (config.min != null && val < config.min) return `Min ${config.min}`;
      if (config.max != null && val > config.max) return `Max ${config.max}`;
      return null;
    },
  },
  boolean: {
    name: 'Boolean',
    description: 'True/false toggle',
    defaultConfig: { default: false },
    validate: (val) => typeof val !== 'boolean' ? 'Must be a boolean' : null,
  },
  date: {
    name: 'Date',
    description: 'Date picker',
    defaultConfig: {},
    validate: (val) => {
      if (typeof val !== 'string') return 'Must be a date string';
      if (isNaN(Date.parse(val))) return 'Invalid date';
      return null;
    },
  },
  datetime: {
    name: 'Date & Time',
    description: 'Date and time picker',
    defaultConfig: {},
    validate: (val) => {
      if (typeof val !== 'string') return 'Must be a datetime string';
      if (isNaN(Date.parse(val))) return 'Invalid datetime';
      return null;
    },
  },
  media: {
    name: 'Media',
    description: 'Image, video or file reference',
    defaultConfig: { multiple: false, accept: null },
    validate: (val, config) => {
      if (config.multiple) {
        if (!Array.isArray(val)) return 'Must be an array of media IDs';
      } else {
        if (typeof val !== 'string') return 'Must be a media ID (UUID)';
      }
      return null;
    },
  },
  select: {
    name: 'Select',
    description: 'Dropdown with predefined options',
    defaultConfig: { options: [], multiple: false },
    validate: (val, config) => {
      const opts = config.options || [];
      if (config.multiple) {
        if (!Array.isArray(val)) return 'Must be an array';
        const invalid = val.find(v => !opts.includes(v));
        if (invalid) return `Invalid option: ${invalid}`;
      } else {
        if (!opts.includes(val)) return `Must be one of: ${opts.join(', ')}`;
      }
      return null;
    },
  },
  relation: {
    name: 'Relation',
    description: 'Reference to another content entry',
    defaultConfig: { contentType: null, multiple: false },
    validate: (val, config) => {
      if (config.multiple) {
        if (!Array.isArray(val)) return 'Must be an array of entry IDs';
      } else {
        if (typeof val !== 'string') return 'Must be an entry ID (UUID)';
      }
      return null;
    },
  },
  slug: {
    name: 'Slug',
    description: 'URL-friendly identifier (auto-generated)',
    defaultConfig: { sourceField: 'title' },
    validate: (val) => {
      if (typeof val !== 'string') return 'Must be a string';
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(val)) return 'Invalid slug format';
      return null;
    },
  },
  url: {
    name: 'URL',
    description: 'Web URL',
    defaultConfig: {},
    validate: (val) => {
      if (typeof val !== 'string') return 'Must be a string';
      try { new URL(val); return null; } catch { return 'Invalid URL'; }
    },
  },
  color: {
    name: 'Color',
    description: 'Hex color picker',
    defaultConfig: {},
    validate: (val) => {
      if (typeof val !== 'string') return 'Must be a string';
      if (!/^#[0-9a-fA-F]{6}$/.test(val)) return 'Must be hex (#RRGGBB)';
      return null;
    },
  },
  json: {
    name: 'JSON',
    description: 'Raw JSON data',
    defaultConfig: {},
    validate: (val) => {
      try { if (typeof val === 'string') JSON.parse(val); return null; }
      catch { return 'Invalid JSON'; }
    },
  },
};

/**
 * Validate content data against field definitions.
 * @param {object} data - Content data
 * @param {Array} fields - Field definitions from content type
 * @returns {{ valid: boolean, errors: object }}
 */
export function validateContentData(data, fields) {
  const errors = {};

  for (const field of fields) {
    const val = data[field.key];
    const type = FIELD_TYPES[field.type];

    if (!type) {
      errors[field.key] = `Unknown field type: ${field.type}`;
      continue;
    }

    // Required check
    if (field.required && (val === undefined || val === null || val === '')) {
      errors[field.key] = 'Required';
      continue;
    }

    // Skip validation if empty and not required
    if (val === undefined || val === null || val === '') continue;

    // Type validation
    const error = type.validate(val, field.config || type.defaultConfig);
    if (error) errors[field.key] = error;
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}
