import { db } from '../client';
import { applySchema } from '../schema';
import { beautyProducts } from './beauty';
import { assertNoNullEmbeddings, embedCatalogue } from './embed';

/**
 * Schema, products, embeddings — the whole seed, in the one order that works.
 *
 * `run.ts` and `reset.ts` differ only in whether they wipe first, so they share
 * this rather than each keeping their own copy of the insert loop.
 */
export async function seedCatalogue({ truncate }: { truncate: boolean }): Promise<void> {
  console.log('Applying schema migrations...');
  await applySchema();
  console.log('Schema ready.');

  if (truncate) {
    console.log('Truncating products and cart data...');
    await db.query('TRUNCATE cart_items, products RESTART IDENTITY CASCADE');
    console.log('Truncated.');
  }

  console.log('Seeding beauty products...');
  const inserted = await insertProducts();
  console.log(
    `Done — ${inserted} products inserted (${beautyProducts.length - inserted} already existed).`
  );

  // After the products exist, never before: embedding reads the rows back out of
  // the database, so it sees exactly the text that was stored.
  await embedCatalogue();
  await assertNoNullEmbeddings();
}

async function insertProducts(): Promise<number> {
  let inserted = 0;
  for (const product of beautyProducts) {
    const result = await db.query(
      `INSERT INTO products (sku, name, brand, category, price, description, image_url, attributes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (sku) DO NOTHING
       RETURNING id`,
      [
        product.sku,
        product.name,
        product.brand,
        product.category,
        product.price,
        product.description,
        product.image_url,
        JSON.stringify(product.attributes),
      ]
    );
    if (result.rowCount) inserted++;
  }
  return inserted;
}

/** Run a seed script: report failures as one legible line, close the pool either way. */
export async function runSeedScript(label: string, seed: () => Promise<void>): Promise<void> {
  try {
    await seed();
  } catch (err) {
    console.error(`${label} failed:`, err instanceof Error ? err.message : err);
    process.exitCode = 1;
  } finally {
    await db.end();
  }
}
