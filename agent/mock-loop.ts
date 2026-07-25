import { loadDomainConfig } from '@/domain.config';
import { getProductLimit } from '@/lib/config';
import { db } from '@/db/client';
import { executeCreateShoppingPlan } from './tools/create_shopping_plan';
import { executeSearchProducts } from './tools/search_products';
import { executeAddToCart } from './tools/add_to_cart';
import type { SSEEvent, ChatMessage, Product } from '@/types';

async function streamWords(text: string, send: (event: SSEEvent) => void) {
  const words = text.split(' ');
  for (const word of words) {
    send({ type: 'text_delta', delta: word + ' ' });
    await new Promise((r) => setTimeout(r, 40));
  }
}

function textOf(content: ChatMessage['content']): string {
  return typeof content === 'string' ? content : '';
}

async function findProductByName(name: string): Promise<Product | null> {
  const result = await db.query<Product>(
    `SELECT id, sku, name, brand, category, price, description, image_url, attributes, in_stock
     FROM products WHERE name = $1 LIMIT 1`,
    [name]
  );
  return result.rows[0] ?? null;
}

async function findProductById(id: string): Promise<Product | null> {
  const result = await db.query<Product>(
    `SELECT id, sku, name, brand, category, price, description, image_url, attributes, in_stock
     FROM products WHERE id = $1 LIMIT 1`,
    [id]
  );
  return result.rows[0] ?? null;
}

export async function runMockAgentLoop(
  messages: ChatMessage[],
  sessionId: string,
  send: (event: SSEEvent) => void
): Promise<ChatMessage[]> {
  const domain = loadDomainConfig();
  const lastMessage = textOf(messages[messages.length - 1]?.content);

  let said = '';
  async function say(text: string) {
    said += text;
    await streamWords(text, send);
  }

  // Count how many products the customer has already chosen
  const chosenCount = messages.filter(
    (m) => m.role === 'user' && textOf(m.content).startsWith("I'd like the ")
  ).length;

  // ── Customer is choosing a product ──────────────────────────────────────────
  if (lastMessage.startsWith("I'd like the ")) {
    // The UI sends: "I'd like the {name} (product_id: {id})". Prefer the explicit
    // id; fall back to an exact name match for manually-typed messages.
    const idMatch = lastMessage.match(/\(product_id:\s*([^)]+)\)/);
    const productName = lastMessage
      .replace("I'd like the ", '')
      .replace(/\s*\(product_id:[^)]*\)\s*$/, '')
      .trim();
    const product = idMatch
      ? await findProductById(idMatch[1].trim())
      : await findProductByName(productName);

    if (product) {
      const cartItem = await executeAddToCart({ product_id: product.id, session_id: sessionId, quantity: 1 });
      send({ type: 'cart_updated', item: cartItem });
      await say(`Great choice! **${product.name}** has been added to your cart.`);
    }

    const nextCategory = domain.categories[chosenCount];

    if (nextCategory) {
      await say(` Now let's find you a ${nextCategory}.`);
      const nextProducts = await executeSearchProducts({ category: nextCategory, filters: {}, limit: getProductLimit() });
      send({ type: 'product_options', products: nextProducts });
      await say(`Here are my top picks. Which one suits you?`);
    } else {
      await say(
        `You're all set! Your cart is complete. Check your cart for the total and hit Checkout whenever you're ready.`
      );
    }

    return [{ role: 'assistant', content: said }];
  }

  // ── First message — customer describes their goal ────────────────────────────
  const budgetMatch = lastMessage.match(/\$(\d+)/);
  const totalBudget = budgetMatch ? parseInt(budgetMatch[1]) : 150;
  const planCategories = domain.categories.slice(0, 3);
  const perCategory = Math.floor(totalBudget / planCategories.length);

  const plan = executeCreateShoppingPlan({
    goal: lastMessage,
    total_budget_aud: totalBudget,
    categories: planCategories.map((name) => ({
      name,
      budget_min: Math.floor(perCategory * 0.6),
      budget_max: perCategory,
    })),
  });
  send({ type: 'shopping_plan', plan });

  await say(
    `I've put together a shopping plan based on your needs. Let's build your cart one step at a time — starting with a ${planCategories[0]}.`
  );

  const firstProducts = await executeSearchProducts({
    category: planCategories[0],
    filters: {},
    limit: getProductLimit(),
  });
  send({ type: 'product_options', products: firstProducts });
  await say(`Here are my top picks. Which one would you like?`);

  return [{ role: 'assistant', content: said }];
}

