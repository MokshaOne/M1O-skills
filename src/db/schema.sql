-- M10 CMS Database Schema
-- Multi-tenant headless CMS with dynamic content types

-- Extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================================
-- USERS & AUTH
-- =============================================================

CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name          TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'site_admin'
                CHECK (role IN ('super_admin', 'site_admin', 'member')),
  avatar_url    TEXT,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id);

-- =============================================================
-- SITES
-- =============================================================

CREATE TABLE IF NOT EXISTS sites (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  slug       TEXT UNIQUE NOT NULL,
  domain     TEXT,
  settings   JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Which users have access to which sites (super_admin has access to all)
CREATE TABLE IF NOT EXISTS site_users (
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role    TEXT NOT NULL DEFAULT 'site_admin'
          CHECK (role IN ('site_admin', 'member')),
  PRIMARY KEY (site_id, user_id)
);

-- API keys for public read access per site
CREATE TABLE IF NOT EXISTS api_keys (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id    UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  key_hash   TEXT NOT NULL,
  key_prefix TEXT NOT NULL,
  is_active  BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_api_keys_site ON api_keys(site_id);

-- =============================================================
-- CONTENT TYPES (Schema Builder)
-- =============================================================

CREATE TABLE IF NOT EXISTS content_types (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id     UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL,
  description TEXT,
  fields      JSONB NOT NULL DEFAULT '[]',
  settings    JSONB NOT NULL DEFAULT '{"draftable": true}',
  permissions JSONB NOT NULL DEFAULT '{}',
  position    INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (site_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_content_types_site ON content_types(site_id);

-- =============================================================
-- CONTENT ENTRIES
-- =============================================================

CREATE TABLE IF NOT EXISTS content_entries (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_type_id UUID NOT NULL REFERENCES content_types(id) ON DELETE CASCADE,
  site_id         UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  owner_id        UUID REFERENCES users(id) ON DELETE SET NULL,
  title           TEXT NOT NULL,
  slug            TEXT NOT NULL,
  data            JSONB NOT NULL DEFAULT '{}',
  seo_title       TEXT,
  seo_description TEXT,
  seo_image_id    UUID,
  status          TEXT NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft', 'published', 'archived')),
  published_at    TIMESTAMPTZ,
  position        INT NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (content_type_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_entries_site ON content_entries(site_id);
CREATE INDEX IF NOT EXISTS idx_entries_type ON content_entries(content_type_id);
CREATE INDEX IF NOT EXISTS idx_entries_status ON content_entries(status);
CREATE INDEX IF NOT EXISTS idx_entries_owner ON content_entries(owner_id);
CREATE INDEX IF NOT EXISTS idx_entries_published ON content_entries(published_at DESC)
  WHERE status = 'published';
CREATE INDEX IF NOT EXISTS idx_entries_data ON content_entries USING gin(data);

-- Content versioning
CREATE TABLE IF NOT EXISTS content_versions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id       UUID NOT NULL REFERENCES content_entries(id) ON DELETE CASCADE,
  data           JSONB NOT NULL,
  title          TEXT,
  status         TEXT NOT NULL,
  version_number INT NOT NULL,
  created_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_versions_entry ON content_versions(entry_id, version_number DESC);

-- =============================================================
-- MEDIA
-- =============================================================

CREATE TABLE IF NOT EXISTS media (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id       UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  uploaded_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  filename      TEXT NOT NULL,
  original_name TEXT NOT NULL,
  mime_type     TEXT NOT NULL,
  size          INT NOT NULL,
  width         INT,
  height        INT,
  alt_text      TEXT,
  title         TEXT,
  description   TEXT,
  exif          JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_media_site ON media(site_id);
CREATE INDEX IF NOT EXISTS idx_media_mime ON media(mime_type);

-- =============================================================
-- WEBHOOKS
-- =============================================================

CREATE TABLE IF NOT EXISTS webhooks (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id    UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  url        TEXT NOT NULL,
  events     TEXT[] NOT NULL DEFAULT '{}',
  secret     TEXT NOT NULL,
  is_active  BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_webhooks_site ON webhooks(site_id);

-- =============================================================
-- SYNC LOG (for deployment / NAS sync)
-- =============================================================

CREATE TABLE IF NOT EXISTS sync_tokens (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT UNIQUE NOT NULL,
  token_hash TEXT NOT NULL,
  is_active  BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sync_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action      TEXT NOT NULL,  -- 'export' | 'import' | 'full_sync'
  status      TEXT NOT NULL DEFAULT 'started'
              CHECK (status IN ('started', 'completed', 'failed')),
  details     JSONB NOT NULL DEFAULT '{}',
  started_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ
);

-- =============================================================
-- UPDATED_AT TRIGGER
-- =============================================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'users','sites','content_types','content_entries','media','webhooks'
  ])
  LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS trg_%s_updated ON %I; CREATE TRIGGER trg_%s_updated BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION update_updated_at();',
      t, t, t, t
    );
  END LOOP;
END;
$$;
