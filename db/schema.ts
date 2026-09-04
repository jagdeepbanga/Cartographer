import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db } from './client';
import { resolveEmbeddingConfig } from '../lib/embeddings';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Apply db/schema.sql, stamping the configured embedding width into the `vector`
 * column, then verify the column that actually exists matches. A `vector(n)`
 * column silently rejects vectors of any other length at INSERT time with a
 * message that names neither the model nor the variable to change, so the check
 * happens here where it can say both.
 */
export async function applySchema(): Promise<void> {
  // The width is all the schema needs. Requiring the API key here would fail the
  // zero-key MOCK_LLM seed before it ever reached the code that decides to skip
  // embedding; the key is demanded in db/seed/embed.ts, where it is actually used.
  const { dimensions, model, provider } = resolveEmbeddingConfig(process.env, {
    requireKey: false,
  });

  const sql = fs
    .readFileSync(path.join(__dirname, 'schema.sql'), 'utf8')
    .replaceAll('{{EMBEDDING_DIMENSIONS}}', String(dimensions));

  await db.query(sql);
  await assertEmbeddingWidth(dimensions, `${provider}/${model}`);
}

async function assertEmbeddingWidth(expected: number, modelLabel: string): Promise<void> {
  // For a pgvector column, atttypmod is the declared dimension count.
  const { rows } = await db.query<{ atttypmod: number }>(
    `SELECT atttypmod FROM pg_attribute
      WHERE attrelid = 'products'::regclass AND attname = 'embedding' AND NOT attisdropped`
  );

  const actual = rows[0]?.atttypmod;
  if (actual === undefined || actual === expected) return;

  throw new Error(
    `products.embedding is vector(${actual}) but ${modelLabel} produces ${expected}-dimension ` +
      'vectors. Postgres cannot widen a vector column in place — drop and re-create it, then ' +
      're-seed:\n\n' +
      '  psql "$DATABASE_URL" -c \'ALTER TABLE products DROP COLUMN embedding\'\n' +
      '  pnpm db:seed\n'
  );
}
