import { db } from '../client';
import { isMockMode } from '../../lib/config';
import { embedTexts, resolveEmbeddingConfig, toVectorLiteral } from '../../lib/embeddings';
import { buildProductDocument, embeddingFingerprint, type EmbeddableProduct } from './document';

interface ProductRow extends EmbeddableProduct {
  id: string;
  sku: string | null;
  embedding_source_hash: string | null;
  has_embedding: boolean;
}

/**
 * Give every product an up-to-date embedding.
 *
 * Idempotent by design: a product whose stored hash matches the document we would
 * embed, and whose vector is actually present, is skipped. Re-seeding therefore
 * costs zero API calls unless the catalogue text changed.
 *
 * Returns the number of products embedded on this run.
 */
export async function embedCatalogue(): Promise<number> {
  // The zero-key demo path. `MOCK_LLM=true` already means "run without any
  // provider key"; failing the seed there would break the one configuration that
  // is supposed to need no keys at all. Every other case fails loudly below.
  if (isMockMode()) {
    console.warn(
      'MOCK_LLM=true — skipping embeddings. Products are seeded with NULL embeddings, ' +
        'so semantic search falls back to the keyword path.'
    );
    return 0;
  }

  // Resolved before any query so a missing key fails immediately, by name, rather
  // than after a batch of null vectors has already been written.
  const config = resolveEmbeddingConfig();

  const { rows } = await db.query<ProductRow>(
    `SELECT id, sku, name, brand, category, description, attributes,
            embedding_source_hash, (embedding IS NOT NULL) AS has_embedding
       FROM products`
  );

  const pending = rows
    .map((row) => ({ row, document: buildProductDocument(row) }))
    .map(({ row, document }) => ({ row, document, hash: embeddingFingerprint(document, config) }))
    .filter(({ row, hash }) => !row.has_embedding || row.embedding_source_hash !== hash);

  const skipped = rows.length - pending.length;
  if (pending.length === 0) {
    console.log(`Embeddings up to date — ${skipped} products unchanged, 0 API calls.`);
    return 0;
  }

  console.log(
    `Embedding ${pending.length} products with ${config.provider}/${config.model} ` +
      `(${config.dimensions}d)${skipped ? `, ${skipped} unchanged` : ''}...`
  );

  const embeddings = await embedTexts(
    pending.map(({ document }) => document),
    config
  );

  await writeEmbeddings(pending.map(({ row, hash }, i) => ({
    id: row.id,
    hash,
    embedding: embeddings[i],
  })));

  console.log(`Embedded ${pending.length} products.`);
  return pending.length;
}

async function writeEmbeddings(
  updates: Array<{ id: string; hash: string; embedding: number[] }>
): Promise<void> {
  // One statement, not one per row: at catalogue scale the round-trips cost more
  // than the embedding call did.
  await db.query(
    `UPDATE products AS p
        SET embedding = v.embedding::vector, embedding_source_hash = v.hash
       FROM (SELECT * FROM unnest($1::uuid[], $2::text[], $3::text[]) AS t(id, embedding, hash)) AS v
      WHERE p.id = v.id`,
    [
      updates.map((u) => u.id),
      updates.map((u) => toVectorLiteral(u.embedding)),
      updates.map((u) => u.hash),
    ]
  );
}

/** Guard for the acceptance criterion: a successful seed leaves no NULL vectors. */
export async function assertNoNullEmbeddings(): Promise<void> {
  if (isMockMode()) return;

  const { rows } = await db.query<{ count: string }>(
    'SELECT COUNT(*)::text AS count FROM products WHERE embedding IS NULL'
  );
  const missing = Number(rows[0].count);
  if (missing > 0) {
    throw new Error(
      `${missing} products still have a NULL embedding after seeding. This should not happen — ` +
        're-run `pnpm db:seed`, and if it persists check the embedding provider logs above.'
    );
  }
}
