# PLAN.md — Autonomous Shopping Agent (Cartographer)

## Context

A portfolio flagship project demonstrating senior AI full-stack capability. The core product is a **generic, domain-configurable shopping agent** that guides a customer through building a cart conversationally — one product category at a time, with human approval at each step. It is not domain-specific (not just beauty, not just electronics) — the domain is defined by a startup config file and the agent adapts its questions and filters accordingly.

Key decisions made during planning:
- Human-in-the-loop at each category (customer picks from 3 options), not a fully autonomous cart
- Domain configured at startup via a JSON config file (Phase 1)
- Mock data in Postgres for Phase 1; real data source in Phase 2
- Next.js UI from Phase 1 (no terminal-only MVP)
- Streaming responses via SSE (Server-Sent Events)

---

## Proposed Architecture

```
┌─────────────────────────────────────────────────────┐
│                   Next.js App                        │
│                                                      │
│  ┌──────────────┐      ┌────────────────────────┐   │
│  │  React UI    │◄────►│  API Routes (SSE)       │   │
│  │  - Chat      │      │  POST /api/chat         │   │
│  │  - Product   │      │  POST /api/cart         │   │
│  │    Cards     │      │  GET  /api/cart         │   │
│  │  - Cart      │      └──────────┬─────────────┘   │
│  └──────────────┘                 │                  │
└──────────────────────────────────────────────────────┘
                                    │
                          ┌─────────▼──────────┐
                          │   Agent Loop        │
                          │   agent/loop.ts     │
                          │                     │
                          │  1. Read domain cfg │
                          │  2. Call Claude API │
                          │  3. Execute tools   │
                          │  4. Stream chunks   │
                          └─────────┬──────────┘
                                    │
              ┌─────────────────────┼──────────────────┐
              │                     │                  │
    ┌─────────▼──────┐   ┌──────────▼───────┐  ┌──────▼──────┐
    │  Anthropic API │   │    Postgres DB    │  │ Domain Config│
    │  claude-sonnet │   │  - products       │  │ beauty.json  │
    │  tool use +    │   │  - cart_items     │  │ electronics  │
    │  streaming     │   │  - sessions       │  │   .json      │
    └────────────────┘   └──────────────────┘  └─────────────┘
```

---

## Folder Structure

```
/
├── app/                          # Next.js App Router
│   ├── api/
│   │   ├── chat/
│   │   │   └── route.ts          # SSE streaming endpoint — agent loop entry point
│   │   └── cart/
│   │       └── route.ts          # Cart read/write (non-streaming)
│   ├── page.tsx                  # Main chat + cart page
│   ├── layout.tsx
│   └── globals.css
│
├── agent/                        # All agent logic (no UI concerns)
│   ├── loop.ts                   # Core agent loop: messages → Claude → tools → stream
│   ├── tools/                    # One file per tool
│   │   ├── create_shopping_plan.ts
│   │   ├── search_products.ts
│   │   ├── get_product_details.ts
│   │   └── add_to_cart.ts
│   ├── tool-registry.ts          # Assembles tool definitions from domain config
│   └── system-prompt.ts          # Builds system prompt injecting domain facets
│
├── domain/                       # Domain config files (one per product domain)
│   ├── beauty.config.json
│   └── electronics.config.json
│
├── db/                           # Database layer
│   ├── client.ts                 # Postgres connection (node-postgres)
│   ├── schema.sql                # Table definitions
│   └── seed/
│       ├── beauty.ts             # ~50 mock beauty products
│       └── run.ts                # Seed runner
│
├── components/                   # React components
│   ├── ChatWindow.tsx            # Message list + input
│   ├── AgentMessage.tsx          # Streaming text bubble
│   ├── ProductOptions.tsx        # 3-card selection row
│   ├── ProductCard.tsx           # Single product card with "Choose this" button
│   └── CartPanel.tsx             # Running cart total + items
│
├── types/
│   └── index.ts                  # Shared types: Product, CartItem, Message, DomainConfig
│
├── lib/
│   └── stream.ts                 # SSE helpers (encode/send chunks)
│
├── .env.local                    # ANTHROPIC_API_KEY, DATABASE_URL, DOMAIN=beauty
└── domain.config.ts              # Loads the active domain config from DOMAIN env var
```

---

## Domain Config Schema

Each domain is a JSON file that tells the agent what facets exist and what values are valid.

```json
// domain/beauty.config.json
{
  "domain": "beauty",
  "label": "Beauty & Skincare",
  "categories": ["cleanser", "moisturiser", "spf", "serum", "toner", "eye cream"],
  "facets": [
    { "key": "skin_type",      "label": "Skin type",      "type": "enum",    "values": ["dry", "oily", "sensitive", "combination", "all"] },
    { "key": "fragrance_free", "label": "Fragrance-free", "type": "boolean"  },
    { "key": "spf_rating",     "label": "SPF rating",     "type": "number"   },
    { "key": "cruelty_free",   "label": "Cruelty-free",   "type": "boolean"  },
    { "key": "price",          "label": "Price (AUD)",    "type": "number"   }
  ]
}
```

```json
// domain/electronics.config.json
{
  "domain": "electronics",
  "label": "Electronics",
  "categories": ["laptop", "monitor", "keyboard", "mouse", "headphones"],
  "facets": [
    { "key": "brand",        "label": "Brand",         "type": "string" },
    { "key": "ram",          "label": "RAM",           "type": "string" },
    { "key": "storage",      "label": "Storage",       "type": "string" },
    { "key": "screen_size",  "label": "Screen size",   "type": "number" },
    { "key": "price",        "label": "Price (AUD)",   "type": "number" }
  ]
}
```

---

## Catalogue Schema (Postgres)

```sql
-- schema.sql

CREATE TABLE products (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT    NOT NULL,
  brand       TEXT,
  category    TEXT    NOT NULL,          -- matches domain config categories
  price       NUMERIC(10,2) NOT NULL,
  description TEXT,
  image_url   TEXT,
  attributes  JSONB   NOT NULL DEFAULT '{}', -- domain-specific facets
  in_stock    BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_products_category   ON products (category);
CREATE INDEX idx_products_attributes ON products USING GIN (attributes);

CREATE TABLE sessions (
  id         TEXT PRIMARY KEY,           -- random UUID, stored in cookie
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE cart_items (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT    NOT NULL REFERENCES sessions(id),
  product_id UUID    NOT NULL REFERENCES products(id),
  quantity   INTEGER NOT NULL DEFAULT 1,
  added_at   TIMESTAMPTZ DEFAULT NOW()
);
```

The `attributes` JSONB column stores domain-specific facets:
- Beauty: `{ "skin_type": "sensitive", "spf_rating": 50, "fragrance_free": true }`
- Electronics: `{ "ram": "16GB", "storage": "512GB SSD", "screen_size": 15.6 }`

---

## Agent Loop Design

```
User message arrives at POST /api/chat (with session_id, message history)
         │
         ▼
agent/loop.ts reads active domain config (loaded from DOMAIN env var)
         │
         ▼
Builds system prompt injecting domain name, categories, and available facets
         │
         ▼
Calls Anthropic API with: messages, tools list, stream: true
         │
         ├──► Claude streams text → forward raw chunks to client via SSE
         │
         └──► Claude emits tool_use block
                  │
                  ├── create_shopping_plan  → formats plan, streams as structured message
                  ├── search_products       → queries Postgres, returns top 3 products
                  ├── get_product_details   → fetches single product by id
                  └── add_to_cart          → inserts cart_item, returns confirmation
                         │
                         ▼
               Tool result added to messages, loop continues
                         │
                         ▼
               Claude sees tool result, continues streaming response
                         │
                         ▼
               Loop exits when Claude emits end_turn with no pending tool calls
```

**Conversation state** is kept in the client (message history array) and sent with each request. No server-side session store needed for Phase 1.

---

## Tool / Function-Calling Interface

```typescript
// types/index.ts — canonical tool input types

type CreateShoppingPlanInput = {
  goal: string;
  total_budget_aud: number;
  categories: Array<{
    name: string;                          // must match domain config categories
    budget_min: number;
    budget_max: number;
    notes?: string;                        // e.g. "fragrance-free preferred"
  }>;
};

type SearchProductsInput = {
  category: string;
  filters: Record<string, string | number | boolean>; // keyed by facet.key
  limit: 3;                                // always 3 — enforced in tool definition
};

type GetProductDetailsInput = {
  product_id: string;
};

type AddToCartInput = {
  product_id: string;
  session_id: string;
  quantity: 1;                             // always 1 for Phase 1
};
```

Tools are assembled dynamically in `agent/tool-registry.ts` — the `search_products` tool description includes the active domain's facet list so Claude knows what filters to use.

---

## Phase-by-Phase Breakdown

### Phase 1 — Working agent loop with UI

**Done when:**
- [ ] Postgres running locally with `products` + `cart_items` + `sessions` tables
- [ ] ~50 mock beauty products seeded (covering 5–6 categories, variety of skin types and prices)
- [ ] Domain config loaded from `DOMAIN=beauty` env var
- [ ] Agent loop calls Claude with streaming + tool use
- [ ] `create_shopping_plan` tool works and plan renders in UI as a structured message
- [ ] `search_products` queries Postgres by category + JSONB attribute filters, returns 3 products
- [ ] `add_to_cart` inserts a row and confirms in the UI
- [ ] Next.js chat UI shows: streaming agent text, 3 product cards per category, cart panel
- [ ] Full demo flow works: "I'm 30, sensitive skin, daily routine under $150" → plan → 3 cleansers → pick one → 3 moisturisers → pick one → 3 SPFs → pick one → cart summary
- [ ] `DOMAIN=electronics` works with electronics config and seeded electronics products (proves genericity)

### Phase 2 — Real data + semantic search

**Done when:**
- [ ] Real product dataset imported (Kaggle source)
- [ ] pgvector extension enabled; product descriptions embedded and stored
- [ ] `search_products` uses vector similarity search instead of exact JSONB match
- [ ] Search quality visibly improves (fuzzy queries like "gentle morning wash" find relevant cleansers)

### Phase 3 — Merchandiser agent

**Done when:**
- [ ] Separate agent that accepts a raw product dump (name + basic info) and outputs: SEO title, cleaned description, assigned category, suggested attributes
- [ ] Duplicate detection: flags products with >90% embedding similarity
- [ ] UI: a simple "Merchandiser" tab where you paste a product and see the enriched output

### Phase 4 — Polish (optional)

**Done when:**
- [ ] Evals: a test harness that runs 10 scripted shopping goals and scores cart quality
- [ ] Multiple domains selectable from the UI (admin dropdown, not just env var)
- [ ] README written for a hiring manager — explains the architecture, shows a demo GIF
- [ ] Deployed (Vercel + managed Postgres)

---

## Tech Stack (confirmed)

| Layer | Choice |
|---|---|
| Framework | Next.js 15 (App Router) |
| Language | TypeScript throughout |
| LLM | Anthropic API — `claude-sonnet-4-6` |
| Database | Postgres (local Docker for dev) |
| DB client | `node-postgres` (`pg`) |
| Streaming | SSE via Next.js Route Handlers |
| Styling | Tailwind CSS |
| Phase 2 search | pgvector |

---

## Key Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Agent ignores the 3-product limit | Enforce `limit: 3` in the tool definition, not just the prompt |
| Tool calls get out of order (add_to_cart before search) | System prompt explicitly states the required sequence; tool descriptions reinforce it |
| JSONB attribute filtering is fragile for fuzzy queries | Acceptable for Phase 1; Phase 2 replaces with pgvector |
| Streaming + tool use is complex to implement correctly | Use Anthropic SDK's built-in stream helpers; follow the streaming tool use pattern from docs |
