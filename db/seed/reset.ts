import { db } from '../client';
import { beautyProducts } from './beauty';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function reset() {
  console.log('Applying schema migrations...');
  const schema = fs.readFileSync(path.join(__dirname, '../schema.sql'), 'utf8');
  await db.query(schema);
  console.log('Schema ready.');

  console.log('Truncating products and cart data...');
  await db.query('TRUNCATE cart_items, products RESTART IDENTITY CASCADE');
  console.log('Truncated.');

  console.log('Seeding beauty products...');
  for (const product of beautyProducts) {
    await db.query(
      `INSERT INTO products (sku, name, brand, category, price, description, image_url, attributes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
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
  }

  console.log(`Done — ${beautyProducts.length} products seeded with images.`);
  await db.end();
}

reset().catch((err) => {
  console.error('Reset failed:', err.message);
  process.exit(1);
});
