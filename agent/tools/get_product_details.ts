import { db } from '@/db/client';
import type { GetProductDetailsInput, Product } from '@/types';

export async function executeGetProductDetails(input: GetProductDetailsInput): Promise<Product | null> {
  const result = await db.query<Product>(
    `SELECT id, name, brand, category, price, description, image_url, attributes, in_stock
     FROM products WHERE id = $1`,
    [input.product_id]
  );
  return result.rows[0] ?? null;
}
