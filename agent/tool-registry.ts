import { tool } from 'ai';
import { z } from 'zod';
import { getProductLimit } from '@/lib/config';
import type { DomainConfig, SSEEvent, CartItem, ShoppingPlan } from '@/types';
import { executeCreateShoppingPlan } from './tools/create_shopping_plan';
import { executeSearchProducts } from './tools/search_products';
import { executeGetProductDetails } from './tools/get_product_details';
import { executeAddToCart } from './tools/add_to_cart';

export function buildTools(
  domain: DomainConfig,
  sessionId: string,
  send: (event: SSEEvent) => void
) {
  // Build dynamic facet filter schema from domain config
  const facetShape: Record<string, z.ZodTypeAny> = {
    price_min: z.number().optional(),
    price_max: z.number().optional(),
  };
  for (const facet of domain.facets) {
    if (facet.key === 'price') continue;
    if (facet.type === 'enum' && facet.values) {
      facetShape[facet.key] = z.enum(facet.values as [string, ...string[]]).optional();
    } else if (facet.type === 'boolean') {
      facetShape[facet.key] = z.boolean().optional();
    } else if (facet.type === 'number') {
      facetShape[facet.key] = z.number().optional();
    } else {
      facetShape[facet.key] = z.string().optional();
    }
  }

  return {
    create_shopping_plan: tool({
      description: "Create a structured shopping plan before searching for any products.",
      inputSchema: z.object({
        goal: z.string().describe("Summary of the customer's shopping goal"),
        total_budget_aud: z.number().describe('Total budget in AUD'),
        categories: z.array(
          z.object({
            name: z.enum(domain.categories as [string, ...string[]]),
            budget_min: z.number(),
            budget_max: z.number(),
            notes: z.string().optional(),
          })
        ),
      }),
      execute: async (input): Promise<ShoppingPlan> => {
        const plan = executeCreateShoppingPlan(input);
        send({ type: 'shopping_plan', plan });
        return plan;
      },
    }),

    search_products: tool({
      description: `Search the product catalogue for a category. Returns exactly ${getProductLimit()} results.`,
      inputSchema: z.object({
        category: z.enum(domain.categories as [string, ...string[]]),
        filters: z.object(facetShape).optional(),
      }),
      execute: async (input) => {
        const products = await executeSearchProducts({
          category: input.category,
          filters: (input.filters ?? {}) as Record<string, string | number | boolean>,
          limit: getProductLimit(),
        });
        send({ type: 'product_options', products });
        return products;
      },
    }),

    get_product_details: tool({
      description: 'Get full details for a specific product by its ID.',
      inputSchema: z.object({
        product_id: z.string().uuid(),
      }),
      execute: async (input) => {
        return executeGetProductDetails(input);
      },
    }),

    add_to_cart: tool({
      description: 'Add a product to the cart after the customer confirms their choice.',
      inputSchema: z.object({
        product_id: z.string().uuid().describe('UUID of the chosen product'),
      }),
      execute: async (input): Promise<CartItem> => {
        const cartItem = await executeAddToCart({
          product_id: input.product_id,
          session_id: sessionId,
          quantity: 1,
        });
        send({ type: 'cart_updated', item: cartItem });
        return cartItem;
      },
    }),
  };
}
