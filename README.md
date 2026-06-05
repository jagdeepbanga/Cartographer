# Cartographer — Autonomous Shopping Agent

A portfolio project demonstrating senior AI full-stack engineering. An AI agent that guides customers through building a personalised cart conversationally — one product category at a time, with human approval at each step.

**Live demo flow:** Customer describes what they need → agent creates a shopping plan → searches the catalogue and presents 3 options per category → customer picks one → agent adds it to the cart → repeat until the cart is complete.

---

## What's been built (Phase 1)

### Agent layer (`agent/`)
- **`loop.ts`** — Core agent loop using the [Vercel AI SDK](https://sdk.vercel.ai). Calls the LLM with streaming + tool use via `streamText`. Supports swapping LLM providers with a single env var (`anthropic`, `openai`, `google`).
- **`tool-registry.ts`** — Builds tool definitions dynamically from the active domain config using Zod schemas. The `search_products` tool automatically knows which facets are available (skin type, SPF rating, etc.) based on the domain.
- **`system-prompt.ts`** — Constructs the system prompt by injecting the active domain's categories and facets, so the agent knows what it's selling without hardcoding.
- **`tools/`** — Four tools the agent can call:
  - `create_shopping_plan` — agent's first move; produces a structured plan card shown in the UI
  - `search_products` — queries Postgres by category + JSONB attribute filters; always returns 3 results
  - `get_product_details` — fetches a single product by ID
  - `add_to_cart` — inserts into `cart_items` and triggers a cart update in the UI

### API layer (`app/api/`)
- **`POST /api/chat`** — SSE streaming endpoint. Receives the conversation history + session ID, runs the agent loop, and streams events back to the browser in real time.
- **`GET /api/cart`** — Returns all cart items for a session, joined with product data.
- **`DELETE /api/cart`** — Removes an item from the cart.

### Frontend (`app/`, `components/`)
- **`ChatWindow`** — Conversational UI. Streams agent text word-by-word as it arrives. Handles three event types from the server: `text_delta` (streaming text), `shopping_plan` (plan card), `product_options` (3 product cards).
- **`ProductCard` / `ProductOptions`** — Shows 3 product cards per category. Clicking "Choose this" pre-fills the chat input, keeping the human in the loop.
- **`CartPanel`** — Live sidebar that updates as products are added. Shows running total.
- **`AgentMessage`** — Renders streaming text with a blinking cursor while the agent is typing.

### Data layer (`db/`, `domain/`)
- **`schema.sql`** — Three tables: `products` (with `attributes JSONB` for domain-specific facets), `sessions`, `cart_items`.
- **`seed/beauty.ts`** — 39 mock beauty products across 6 categories (cleanser, moisturiser, SPF, serum, toner, eye cream) with realistic names, brands, prices, and skin-type attributes.
- **`domain/beauty.config.json`** — Defines the active domain: categories and facets (skin type, fragrance-free, SPF rating, cruelty-free). Swap to `domain/electronics.config.json` for an electronics store.

---

## Tech stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript throughout |
| LLM | Vercel AI SDK — Anthropic / OpenAI / Google Gemini |
| Database | PostgreSQL (Docker) |
| DB client | `node-postgres` (`pg`) |
| Streaming | Server-Sent Events (SSE) |
| Styling | Tailwind CSS v4 |
| Package manager | pnpm |

---

## Prerequisites

- Node.js 18+
- pnpm (`npm install -g pnpm`)
- Docker (for Postgres)
- An API key for at least one LLM provider

---

## How to run

### 1. Install dependencies

```bash
pnpm install
```

### 2. Configure environment variables

Copy the example file and fill in your keys:

```bash
cp .env.example .env.local
```

Then edit `.env.local` and replace the placeholder values:

```env
# Choose one provider and add its key
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
GOOGLE_GENERATIVE_AI_API_KEY=...

# Set the active provider (anthropic | openai | google)
LLM_PROVIDER=google

# Postgres — see step 3 (default works with the Docker command below)
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/cartographer

# Active product domain (beauty | electronics)
DOMAIN=beauty
```

> `.env.example` is committed to the repo as a reference template. `.env.local` is git-ignored and holds your real keys — never commit it.

### 3. Start Postgres

```bash
docker run --name cartographer-db \
  -e POSTGRES_PASSWORD=postgres \
  -p 5432:5432 -d postgres

docker exec -it cartographer-db psql -U postgres -c "CREATE DATABASE cartographer;"
```

### 4. Run schema migrations and seed data

```bash
pnpm db:seed
```

Expected output:
```
Running schema migrations...
Schema ready.
Seeding beauty products...
Done — 39 products inserted (0 already existed).
```

### 5. Start the dev server

```bash
pnpm dev
```

Open **http://localhost:3000**

### 6. Try it

Type into the chat:

> I'm 30 with sensitive skin. I want a daily face routine under $150.

The agent will:
1. Show a shopping plan (cleanser → moisturiser → SPF)
2. Present 3 product cards per category
3. Add your chosen products to the cart panel on the right

---

## Switching LLM providers

Change `LLM_PROVIDER` in `.env.local` and restart the server:

```env
LLM_PROVIDER=anthropic   # Claude Sonnet 4.6
LLM_PROVIDER=openai      # GPT-4o
LLM_PROVIDER=google      # Gemini 2.5 Flash
```

No code changes needed — the Vercel AI SDK normalises tool use and streaming across all providers.

---

## Switching product domains

Change `DOMAIN` in `.env.local` and restart:

```env
DOMAIN=beauty        # Beauty & Skincare (39 products seeded)
DOMAIN=electronics   # Electronics (seed data not yet added)
```

To add a new domain, create `domain/your-domain.config.json` following the same structure as `beauty.config.json`, register it in `domain.config.ts`, and seed products with matching `attributes`.

---

## Project structure

```
├── agent/
│   ├── loop.ts                  # Agent loop (streamText + tool calls)
│   ├── tool-registry.ts         # Builds Zod-typed tools from domain config
│   ├── system-prompt.ts         # Injects domain context into system prompt
│   └── tools/
│       ├── create_shopping_plan.ts
│       ├── search_products.ts
│       ├── get_product_details.ts
│       └── add_to_cart.ts
├── app/
│   ├── api/chat/route.ts        # SSE streaming endpoint
│   ├── api/cart/route.ts        # Cart CRUD
│   └── page.tsx                 # Main page
├── components/
│   ├── ChatWindow.tsx           # Streaming chat + SSE event handler
│   ├── ProductOptions.tsx       # 3-card selection row
│   ├── ProductCard.tsx          # Single product card
│   ├── CartPanel.tsx            # Live cart sidebar
│   └── AgentMessage.tsx         # Streaming text bubble
├── db/
│   ├── schema.sql               # products / sessions / cart_items
│   ├── client.ts                # Postgres pool
│   └── seed/
│       ├── beauty.ts            # Mock beauty product data
│       └── run.ts               # Seed runner (tsx --env-file)
├── domain/
│   ├── beauty.config.json       # Categories + facets for beauty domain
│   └── electronics.config.json  # Categories + facets for electronics domain
├── domain.config.ts             # Loads active domain from DOMAIN env var
├── lib/stream.ts                # SSE helpers
└── types/index.ts               # Shared TypeScript types
```

---

## Roadmap

- **Phase 2** — Real product data + pgvector semantic search
- **Phase 3** — Merchandiser agent (SEO title generation, duplicate detection)
- **Phase 4** — Evals, multi-domain UI switcher, Vercel deployment
