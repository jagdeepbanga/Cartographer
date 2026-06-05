import { db } from '@/db/client';
import type { AddToCartInput, CartItem } from '@/types';

export async function executeAddToCart(input: AddToCartInput): Promise<CartItem> {
  // Ensure session exists
  await db.query(
    `INSERT INTO sessions (id) VALUES ($1) ON CONFLICT DO NOTHING`,
    [input.session_id]
  );

  const result = await db.query<CartItem>(
    `WITH inserted AS (
       INSERT INTO cart_items (session_id, product_id, quantity)
       VALUES ($1, $2, $3)
       RETURNING id, session_id, product_id, quantity, added_at
     )
     SELECT i.*, row_to_json(p) AS product
     FROM inserted i
     JOIN products p ON p.id = i.product_id`,
    [input.session_id, input.product_id, input.quantity ?? 1]
  );

  return result.rows[0];
}
