import { db } from '../client';
import { beautyProducts } from './beauty';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function seed() {
  console.log('Running schema migrations...');
  const schema = fs.readFileSync(path.join(__dirname, '../schema.sql'), 'utf8');
  await db.query(schema);
  console.log('Schema ready.');

  console.log('Seeding beauty products...');
  let inserted = 0;
  for (const product of beautyProducts) {
    const result = await db.query(
      `INSERT INTO products (name, brand, category, price, description, attributes)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT DO NOTHING
       RETURNING id`,
      [
        product.name,
        product.brand,
        product.category,
        product.price,
        product.description,
        JSON.stringify(product.attributes),
      ]
    );
    if (result.rowCount) inserted++;
  }

  console.log(`Done — ${inserted} products inserted (${beautyProducts.length - inserted} already existed).`);
  await db.end();
}

seed().catch((err) => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});
