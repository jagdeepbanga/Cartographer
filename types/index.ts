import type { ModelMessage } from 'ai';

export type DomainFacet = {
  key: string;
  label: string;
  type: 'enum' | 'boolean' | 'number' | 'string';
  values?: string[];
};

export type DomainConfig = {
  domain: string;
  label: string;
  categories: string[];
  facets: DomainFacet[];
};

export type Product = {
  id: string;
  sku: string;
  name: string;
  brand: string | null;
  category: string;
  price: number;
  description: string | null;
  image_url: string | null;
  attributes: Record<string, string | number | boolean>;
  in_stock: boolean;
};

export type CartItem = {
  id: string;
  session_id: string;
  product_id: string;
  quantity: number;
  added_at: string;
  product?: Product;
};

export type ShoppingPlanCategory = {
  name: string;
  budget_min: number;
  budget_max: number;
  notes?: string;
};

export type ShoppingPlan = {
  goal: string;
  total_budget_aud: number;
  categories: ShoppingPlanCategory[];
};

// A full conversation turn as understood by the AI SDK — preserves tool
// calls and tool results across turns, not just the rendered text, so the
// model can see exactly what it did instead of reconstructing state from prose.
export type ChatMessage = ModelMessage;

// Tool input types
export type CreateShoppingPlanInput = {
  goal: string;
  total_budget_aud: number;
  categories: ShoppingPlanCategory[];
};

export type SearchProductsInput = {
  category: string;
  filters: Record<string, string | number | boolean>;
  limit: number;
};

export type GetProductDetailsInput = {
  product_id: string;
};

export type AddToCartInput = {
  product_id: string;
  session_id: string;
  quantity: number;
};

// SSE event types sent from the server to the client
export type SSEEvent =
  | { type: 'text_delta'; delta: string }
  | { type: 'product_options'; products: Product[] }
  | { type: 'shopping_plan'; plan: ShoppingPlan }
  | { type: 'cart_updated'; item: CartItem }
  | { type: 'done'; messages: ChatMessage[] }
  | { type: 'error'; message: string };
