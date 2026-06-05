CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS products (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT         NOT NULL,
  brand       TEXT,
  category    TEXT         NOT NULL,
  price       NUMERIC(10,2) NOT NULL,
  description TEXT,
  image_url   TEXT,
  attributes  JSONB        NOT NULL DEFAULT '{}',
  in_stock    BOOLEAN      NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_products_category   ON products (category);
CREATE INDEX IF NOT EXISTS idx_products_attributes ON products USING GIN (attributes);

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
