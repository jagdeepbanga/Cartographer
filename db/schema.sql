-- NOTE: this file is a template, not directly `psql -f`-able. `{{EMBEDDING_DIMENSIONS}}`
-- below is substituted by db/schema.ts, which is what the seed scripts call. The
-- width has to come from the embedding config: the two supported providers have
-- different native vector sizes, so a hardcoded number would be wrong for one of them.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Semantic retrieval. Available on Neon, Supabase and RDS out of the box; locally
-- it comes from the `pgvector/pgvector` Postgres image in docker-compose.yml (the
-- stock `postgres` image does not ship it).
CREATE EXTENSION IF NOT EXISTS "vector";

CREATE TABLE IF NOT EXISTS products (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT         NOT NULL,
  sku         TEXT,
  brand       TEXT,
  category    TEXT         NOT NULL,
  price       NUMERIC(10,2) NOT NULL,
  description TEXT,
  image_url   TEXT,
  attributes  JSONB        NOT NULL DEFAULT '{}',
  in_stock    BOOLEAN      NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Ensure `sku` exists on pre-existing tables (CREATE TABLE above is skipped when
-- the table already exists), then enforce uniqueness so re-seeding can dedupe on
-- it via ON CONFLICT (sku).
ALTER TABLE products ADD COLUMN IF NOT EXISTS sku TEXT;

-- One embedding per product (see db/seed/document.ts for why the whole record is
-- a single chunk). The column width is stamped in from EMBEDDING_DIMENSIONS by
-- db/schema.ts, so the model and the schema cannot drift apart silently.
-- `embedding_source_hash` fingerprints the exact text that produced the vector,
-- which is what makes re-seeding idempotent: unchanged text is not re-embedded.
ALTER TABLE products ADD COLUMN IF NOT EXISTS embedding vector({{EMBEDDING_DIMENSIONS}});
ALTER TABLE products ADD COLUMN IF NOT EXISTS embedding_source_hash TEXT;

CREATE INDEX IF NOT EXISTS idx_products_category   ON products (category);
CREATE INDEX IF NOT EXISTS idx_products_attributes ON products USING GIN (attributes);
CREATE UNIQUE INDEX IF NOT EXISTS idx_products_sku  ON products (sku);

CREATE TABLE IF NOT EXISTS sessions (
  id         TEXT        PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cart_items (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT        NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  product_id UUID        NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  quantity   INTEGER     NOT NULL DEFAULT 1,
  added_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
