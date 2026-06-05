import { db } from '@/db/client';
import type { Product, SearchProductsInput } from '@/types';

export async function executeSearchProducts(input: SearchProductsInput): Promise<Product[]> {
  const conditions: string[] = ['category = $1', 'in_stock = true'];
  const params: unknown[] = [input.category];
  let paramIndex = 2;

  const filters = input.filters ?? {};

  if (filters.price_min !== undefined) {
    conditions.push(`price >= $${paramIndex++}`);
    params.push(filters.price_min);
  }
  if (filters.price_max !== undefined) {
    conditions.push(`price <= $${paramIndex++}`);
    params.push(filters.price_max);
  }

  // Apply JSONB attribute filters for all other facet keys
  for (const [key, value] of Object.entries(filters)) {
    if (key === 'price_min' || key === 'price_max') continue;
    conditions.push(`attributes->>'${key}' = $${paramIndex++}`);
    params.push(String(value));
  }

  const where = conditions.join(' AND ');
  const query = `
    SELECT id, name, brand, category, price, description, image_url, attributes, in_stock
    FROM products
    WHERE ${where}
    ORDER BY price ASC
    LIMIT $${paramIndex}
  `;

  params.push(input.limit);
  const result = await db.query<Product>(query, params);
  return result.rows;
}
