# Cartographer — Autonomous Shopping Agent

A portfolio project demonstrating senior AI full-stack engineering. An AI agent that guides customers through building a personalised cart conversationally — one product category at a time, with human approval at each step.

**Live demo flow:** Customer describes what they need → agent creates a shopping plan → searches the catalogue and presents 3 options per category → customer picks one → agent adds it to the cart → repeat until the cart is complete.

## Demo

![Cartographer demo](docs/demo.gif)

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
OPENROUTER_API_KEY=sk-or-...

# Set the active provider (anthropic | openai | google | openrouter)
LLM_PROVIDER=google

# Embedding provider — separate from LLM_PROVIDER (openai | google, default openai)
EMBEDDING_PROVIDER=openai

# Postgres — see step 3 (default works with the Docker command below)
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/cartographer

# Active product domain (beauty | electronics)
DOMAIN=beauty
```

> `.env.example` is committed to the repo as a reference template. `.env.local` is git-ignored and holds your real keys — never commit it.

### 3. Start Postgres

The image must ship **pgvector** — the stock `postgres` image does not, and the
schema enables the `vector` extension for semantic search.

```bash
docker run --name cartographer-db \
  -e POSTGRES_PASSWORD=postgres \
  -p 5432:5432 -d pgvector/pgvector:pg16

docker exec -it cartographer-db psql -U postgres -c "CREATE DATABASE cartographer;"
```

Or use compose, which already points at that image: `docker compose up -d db`
(published on host port 5433 — see [Running in Docker](#running-in-docker)).

> **Upgrading an existing local database?** If you previously ran the stock
> `postgres` image, delete the old volume before switching — the two images are
> built on different Debian releases and Postgres will warn about a collation
> version mismatch. `docker compose down -v && docker compose up -d db`, then
> re-seed. It is a throwaway dev database.

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
Embedding 39 products with openai/text-embedding-3-small (1536d)...
Embedded 39 products.
```

Seeding also embeds the catalogue, so it needs the embedding provider's API key
(`OPENAI_API_KEY` by default). Without one it stops with an error naming the exact
variable rather than writing empty vectors. Re-running is cheap: a product whose
text has not changed is not re-embedded, and a fully unchanged catalogue costs
zero API calls.

For the zero-key demo, `MOCK_LLM=true pnpm db:seed` skips embedding entirely and
seeds products with `NULL` vectors — semantic search then falls back to the
keyword path.

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

## Run with Docker

A production-like, fully containerized stack (Postgres + the app running Next.js
[standalone output](https://nextjs.org/docs/app/api-reference/config/next-config-js/output))
lives in `Dockerfile` + `docker-compose.yml`. The app image is
environment-agnostic — Postgres and all secrets are injected as env vars, so the
same image is what will run on AWS later.

```bash
# 1. Build the app image
docker compose build app

# 2. Start Postgres (named volume + healthcheck; published on host port 5433)
docker compose up -d db

# 3. One-off: apply schema + seed products (behind the `seed` profile, so it
#    never runs on a normal `up`). Re-run any time to re-seed.
docker compose --profile seed run --rm seed

# 4. Start the app (reads config — provider keys, DOMAIN, MOCK_LLM, … — from .env.local)
docker compose up app
# → http://localhost:3000
```

The app's runtime config comes from **`.env.local`** (loaded via `env_file`), the
same file the non-Docker workflow uses.

- **No API key / first smoke test:** set `MOCK_LLM=true` in `.env.local`, then
  `docker compose up app`. The agent runs a scripted demo loop with no LLM calls.
  For a one-off run without editing the file, inject it directly (a bare
  `MOCK_LLM=... docker compose up` does **not** reach the container — that only
  substitutes `${...}` inside the compose file):
  ```bash
  docker compose run --rm --service-ports -e MOCK_LLM=true app
  ```
- **Live provider:** set `LLM_PROVIDER` + the matching key in `.env.local`
  (`MOCK_LLM=false`), then `docker compose up app`.

Notes:
- **Secrets** (`ANTHROPIC_API_KEY` / `OPENAI_API_KEY` /
  `GOOGLE_GENERATIVE_AI_API_KEY` / `OPENROUTER_API_KEY`, etc.) come from `.env.local` via `env_file` and
  are never baked into the image. Compose overrides `DATABASE_URL` to point at the
  `db` service on the internal network.
- **Port already in use?** If `pnpm dev` is running, start the container on a
  different host port: `APP_PORT=3001 docker compose up app` (this one *is* a
  compose `${APP_PORT}` substitution, so the shell var works here).
- **Postgres port already in use?** Same trick for the DB — if another project
  holds 5433, publish it elsewhere with `DB_PORT=5434 docker compose up -d db`
  and update `DATABASE_URL` in `.env.local` to match. Only the *host* mapping
  changes; the app still reaches Postgres at `db:5432` inside the network.

---

## Switching LLM providers

Change `LLM_PROVIDER` in `.env.local` and restart the server:

```env
LLM_PROVIDER=anthropic   # Claude Sonnet 4.6
LLM_PROVIDER=openai      # GPT-4o
LLM_PROVIDER=google      # Gemini 2.5 Flash
LLM_PROVIDER=openrouter  # any model on OpenRouter — see below
```

With `openrouter` you get every model OpenRouter lists behind a single key. It
defaults to `minimax/minimax-m2.7:free` — a free, tool-capable model — so you can run the
agent for real without spending anything. Override with `OPENROUTER_MODEL`:

```env
LLM_PROVIDER=openrouter
OPENROUTER_API_KEY=sk-or-...
OPENROUTER_MODEL=anthropic/claude-sonnet-4.5   # any slug from openrouter.ai/models
```

Model slugs come from [openrouter.ai/models](https://openrouter.ai/models). The
agent needs tool calling, so pick a model whose listing supports it — free models
that do include `minimax/minimax-m2.7:free`, `nvidia/nemotron-3.5-lightning:free`
and `z-ai/glm-5.2:free`. Free tiers share an upstream pool and return HTTP 429
when it is busy — retry, try another free slug, or switch to a paid one.

No code changes needed — the Vercel AI SDK normalises tool use and streaming across all providers.

---

## Embeddings

Semantic retrieval needs vectors, and the chat provider cannot supply them:
**Anthropic ships no embeddings API** and is one of the four `LLM_PROVIDER`
choices. So the embedding provider is configured **independently**, with its own
variables and its own default:

```env
EMBEDDING_PROVIDER=openai                 # openai | google (default: openai)
EMBEDDING_MODEL=text-embedding-3-small    # optional — per-provider default below
# EMBEDDING_DIMENSIONS=1536               # optional — the model's default otherwise
```

| Provider | Default model | Dimensions | Key |
| --- | --- | --- | --- |
| `openai` | `text-embedding-3-small` | 1536 | `OPENAI_API_KEY` |
| `google` | `gemini-embedding-001` | 3072 | `GOOGLE_GENERATIVE_AI_API_KEY` |

Each product gets **one embedding, over the whole record** — no sub-document
chunks. The rationale lives next to the code that assembles the document, in
`db/seed/document.ts`.

**No embedding key?** Seeding stops with an error naming the variable to set. If
your only key is a chat key for a provider with no embeddings API (Anthropic),
either set `EMBEDDING_PROVIDER` to one you do have a key for, or seed with
`MOCK_LLM=true` to skip embedding and stay on the keyword path.

**Changing the embedding model.** `products.embedding` is a `vector(n)` column
stamped from `EMBEDDING_DIMENSIONS`, and Postgres cannot resize one in place. The
seed detects the mismatch and tells you what to run:

```bash
psql "$DATABASE_URL" -c 'ALTER TABLE products DROP COLUMN embedding'
pnpm db:seed
```

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

## Deploy to Vercel (free)

Hobby plan + a free Neon Postgres — $0, ~10 minutes. Full walkthrough:
**[docs/DEPLOY-VERCEL.md](docs/DEPLOY-VERCEL.md)**.

```bash
# 1. Import the repo at vercel.com → Add New… → Project
# 2. Storage → Create Database → Neon (Postgres), Free plan  → sets DATABASE_URL
# 3. Seed the remote DB from your laptop
DATABASE_URL="postgresql://…" OPENAI_API_KEY=sk-… pnpm db:seed:remote
# 4. git push  → deploys
```

Neon ships pgvector, so the seed path is identical to local — no extra step.

Set `MOCK_LLM=true` in the Vercel env vars for a demo that needs **no API key**
at all — scripted agent loop, real products, real cart, real streaming.

---

## Roadmap

- **Phase 2** — Real product data + pgvector semantic search
- **Phase 3** — Merchandiser agent (SEO title generation, duplicate detection)
- **Phase 4** — Evals, multi-domain UI switcher
