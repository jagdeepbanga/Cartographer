import { db } from '@/db/client';
import type { CartItem, Product } from '@/types';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const sessionId = searchParams.get('sessionId');

  if (!sessionId) {
    return Response.json({ error: 'Missing sessionId' }, { status: 400 });
  }

  const result = await db.query<CartItem & { product: Product }>(
    `SELECT
       ci.id, ci.session_id, ci.product_id, ci.quantity, ci.added_at,
       row_to_json(p) AS product
     FROM cart_items ci
     JOIN products p ON p.id = ci.product_id
     WHERE ci.session_id = $1
     ORDER BY ci.added_at ASC`,
    [sessionId]
  );

  return Response.json({ items: result.rows });
}

export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const sessionId = searchParams.get('sessionId');
  const itemId = searchParams.get('itemId');

  if (!sessionId || !itemId) {
    return Response.json({ error: 'Missing sessionId or itemId' }, { status: 400 });
  }

  await db.query(
    `DELETE FROM cart_items WHERE id = $1 AND session_id = $2`,
    [itemId, sessionId]
  );

  return Response.json({ ok: true });
}
