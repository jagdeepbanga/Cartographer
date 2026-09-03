# Deploy Cartographer to Vercel (free tier)

Everything below fits inside Vercel's Hobby plan and Neon's free Postgres tier.
Total cost: $0. Expect ~10 minutes end to end.

Cartographer is a plain Next.js app with two dynamic route handlers
(`/api/chat`, `/api/cart`) and a Postgres database. Nothing about it is
Vercel-specific — the same commit still builds the Docker image (see the
"Run with Docker" section of the README).

---

## What this costs

$0 for a demo of this size, on three separate free tiers:

| Piece | Plan | What you get | Where it stops being free |
| --- | --- | --- | --- |
| Hosting | Vercel **Hobby** | Builds, serverless functions, bandwidth, HTTPS domain | Hobby is licensed for **non-commercial** use. A portfolio/interview demo is fine; a revenue-generating product needs Pro. Heavy traffic hits bandwidth/function quotas. |
| Database | Neon **Free** | One project, a few hundred MB of storage, autosuspend when idle | This app seeds 39 rows — storage is a rounding error. You'd need real traffic to approach the compute-hours cap. |
| Model | OpenRouter **`:free` models** | Tool-capable models at no charge | **20 requests/min**, and **50 requests/day** unless you have ever bought $10 of credits (then 1000/day). See below — this is the binding constraint. |

No credit card is required for any of the three.

### The one limit that actually bites: OpenRouter's 50 requests/day

This is the constraint to plan around, and it is not obvious, because **one user
message is not one API request**. The agent is a multi-step loop: it calls
`create_shopping_plan`, then `search_products`, then writes its answer — each step
is a separate request to the model.

Measured on a real run of the demo prompt ("I'm 30 with sensitive skin…"): **3
requests for a single user message.** A fuller demo where you then pick products
and add them to the cart runs 2–4 more per turn.

So the practical budget on a fresh OpenRouter account:

| Daily cap | Roughly this many user messages |
| --- | --- |
| 50/day (no credits ever purchased) | **~10–15** |
| 1000/day (after a one-time $10 credit purchase) | ~300 |

Ten to fifteen messages is enough for *one* clean demo, but not enough to rehearse
the demo three times that morning and still have headroom. Options, cheapest first:

1. **Rehearse with `MOCK_LLM=true`, present with the live model.** Costs nothing
   and consumes no quota. This is the recommendation.
2. **Rehearse locally** (`pnpm dev`) — same account, same quota, so this does *not*
   help. Only mock mode does.
3. **Use Google instead.** `LLM_PROVIDER=google` with `gemini-2.5-flash` and an AI
   Studio key has a free tier with a considerably higher request allowance than
   OpenRouter's 50/day, and it is faster. A good fallback if you burn the quota.
4. **Buy $10 of OpenRouter credits once.** Not free, but it is a one-time purchase
   that raises the free-model cap to 1000/day, and the credits stay in your account
   for paid models. Only worth it if you're demoing repeatedly.

Hitting the cap returns an HTTP 429 and the chat shows an error — it does not
silently charge you.

Things that would start costing money, so you know what to avoid:

- Switching `LLM_PROVIDER` to `anthropic` / `openai` / `google` with a paid key —
  those bill per token. Only the OpenRouter `:free` slugs are free.
- Dropping `:free` from `OPENROUTER_MODEL`. `minimax/minimax-m2.7` and
  `minimax/minimax-m2.7:free` are different products; the suffix is what makes it
  free.
- Vercel will *not* silently bill you on Hobby; it stops serving or throttles when
  a quota is hit rather than charging overage.

Quotas on all three change over time, so check the current numbers on each
provider's pricing page rather than trusting this table's specifics.

For a demo where nothing may go wrong, `MOCK_LLM=true` removes the model from the
equation entirely — then only Vercel and Neon are in play, and neither has a
per-request cost.

---

## 1. Create the database

Vercel has no built-in Postgres of its own — it provisions one from a partner via
the Marketplace. Neon's free plan is the path of least resistance because Vercel
injects the connection string into the project for you.

1. Push this repo to GitHub (public or private — both work on Hobby).
2. In Vercel → **Add New… → Project** → import the repo. Next.js is detected
   automatically, and pnpm is picked up from `pnpm-lock.yaml`.
3. In the project → **Storage → Create Database → Neon (Postgres)** → Free plan →
   Connect. Vercel writes `DATABASE_URL` (plus `POSTGRES_*` aliases) into
   Production, Preview and Development for you. Nothing else to configure.

That is the whole integration — the app reads one variable, `DATABASE_URL`, and
`db/client.ts` does the rest.

### Pooled vs direct connection string

Neon (and Supabase) hand out two URLs. The difference matters on serverless:

| | Host contains | Use it for |
| --- | --- | --- |
| **Pooled** | `-pooler` | `DATABASE_URL` in Vercel — the app |
| **Direct** | no `-pooler` | running the seed/migration scripts from your laptop |

Every serverless invocation is its own container with its own connection pool, so
a few concurrent requests can exhaust a free-tier connection cap fast. Two things
already guard against that:

- `db/client.ts` caps the pool at **5 connections per instance** when `VERCEL` is
  set, and drops idle connections after 10s. (Fluid Compute reuses one instance
  across concurrent requests, so a pool of 1 would serialise queries — this is not
  the old one-request-per-container model.)
- The pooled URL puts PgBouncer in front of the database.

Use the pooled string for the deployed app. Use the direct string for seeding,
because DDL (`CREATE EXTENSION`, `CREATE TABLE`) is happier outside a transaction
pooler.

### TLS

Managed Postgres refuses unencrypted connections; a local or Compose Postgres
doesn't offer TLS at all. `db/client.ts` decides from the host — anything that
isn't `localhost`, `127.0.0.1` or `db` gets TLS. You don't have to set anything,
and the same code still works against your Docker Postgres.

### Extensions

`db/schema.sql` needs exactly one extension, `pgcrypto` (for `gen_random_uuid()`).
It is available on Neon, Supabase and RDS, and `CREATE EXTENSION IF NOT EXISTS`
runs as part of seeding. No other extension is required.

### Other providers

Any Postgres works — Supabase, Railway, Render, or an existing RDS instance. Only
`DATABASE_URL` matters; there is no provider-specific code in the app. If you go
outside the Vercel Marketplace, add `DATABASE_URL` yourself under Settings →
Environment Variables.

## 2. Set environment variables

Project → **Settings → Environment Variables**. Apply to Production, Preview and
Development.

| Variable | Value for a demo | Notes |
| --- | --- | --- |
| `DATABASE_URL` | *(auto-set by the Neon integration)* | Required. |
| `LLM_PROVIDER` | `openrouter` | `anthropic` \| `openai` \| `google` \| `openrouter` |
| `OPENROUTER_API_KEY` | your key | Or the key matching the provider you chose. |
| `OPENROUTER_MODEL` | `minimax/minimax-m2.7:free` | Free, tool-capable default. |
| `DOMAIN` | `beauty` | Or `electronics`. |
| `PRODUCT_LIMIT` | `4` | Cards shown per category. |
| `MOCK_LLM` | `false` | Set `true` to demo with **no API key at all**. |

**Zero-key demo:** set `MOCK_LLM=true` and skip every provider key. The agent
runs the scripted loop in `agent/mock-loop.ts` — real products, real cart, real
streaming UI, no model calls. This is the most robust setting for a live demo
where a rate limit or an expired key would be embarrassing.

## 3. Seed the database

Nothing in the Vercel build touches Postgres, so a freshly provisioned database is
empty and the app will error with `relation "products" does not exist`. Seed it
once from your laptop.

Copy the **direct** connection string from Vercel (Storage → your database →
Connection string), then:

```bash
# Schema + 39 beauty products. Idempotent — skips rows that already exist.
DATABASE_URL="postgresql://…" pnpm db:seed:remote

# Or wipe and re-seed from scratch (TRUNCATE + insert)
DATABASE_URL="postgresql://…" pnpm db:reset:remote
```

Both scripts apply `db/schema.sql` first, so this creates the tables, indexes and
the `pgcrypto` extension as well — there is no separate migration step.

These two scripts read `DATABASE_URL` from the shell. The plain `pnpm db:seed` /
`pnpm db:reset` variants read `.env.local` instead and are for local development —
don't use those against production, they will point at your Docker Postgres.

Verify it landed:

```bash
DATABASE_URL="postgresql://…" node -e "const{Pool}=require('pg');\
new Pool({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:false}})\
.query('select count(*) from products').then(r=>console.log(r.rows[0]))"
```

### Re-seeding before a demo

Carts accumulate across demo runs. `pnpm db:reset:remote` clears `cart_items` and
`products` and re-seeds, giving you a clean slate.

## 4. Deploy

```bash
git push        # every push to the default branch deploys Production
```

or, from the CLI:

```bash
pnpm dlx vercel@latest        # preview deploy
pnpm dlx vercel@latest --prod # production deploy
```

Open the URL and try: *"I'm 30 with sensitive skin. I want a daily face routine
under $150."*

---

## Locking the demo behind a password

A public deployment means anyone who finds the URL can send chat requests, and
each one costs a slice of a daily model quota that is not large. `proxy.ts` puts
a single shared password in front of **every page and API route** using HTTP
Basic auth.

Set one variable in Vercel and redeploy:

```
DEMO_PASSWORD=<whatever you want to share>
```

- **Unset it and the gate disappears.** Local development and the Docker image
  are unaffected because neither sets it.
- **Any username works** — the password is the whole secret, so there is one
  credential to pass along rather than a pair to coordinate.
- The browser prompts once and then replays the credentials on every same-origin
  request, so the SSE chat stream is covered with no client-side changes.
- Static assets (`_next/static`, `_next/image`, the favicon) are excluded from the
  matcher, since challenging those would break the page before it renders.

Verified against a production build: no credentials → 401 with a
`WWW-Authenticate` challenge, wrong password → 401, correct password → 200, and
`/api/cart` → 401 until authenticated.

Basic auth sends the password base64-encoded, not encrypted — it is only private
because Vercel serves everything over HTTPS. That is the right level of effort
for keeping strangers off a demo quota; it is not a login system, so don't put
anything sensitive behind it.

Vercel also offers Deployment Protection natively. Its "Vercel Authentication"
mode restricts access to your own Vercel account, which is awkward for sharing a
link with someone who has no account; password protection is a paid add-on on
some plans. Check the current plan details in the dashboard — `proxy.ts` costs
nothing and works on any host.

---

## Free-tier limits worth knowing before a demo

- **Function duration.** The default is **300s on all plans, Hobby included**
  (it was 60–90s historically — a lot of documentation and LLM advice is still
  stale on this). `/api/chat` declares `export const maxDuration = 300` so the
  ceiling is explicit. A measured demo run takes ~11s, so there is a wide margin;
  the agent's own `stepCountIs(20)` cap will stop a runaway loop long before the
  platform does.
- **Streaming.** SSE works on Hobby; `lib/stream.ts` sends `X-Accel-Buffering: no`
  so tokens are not buffered by the edge.
- **Cold starts.** The first request after idle takes a second or two. Load the
  page once right before demoing.
- **Neon free tier** suspends an idle database after ~5 minutes; the first query
  wakes it (a few hundred ms). Same warm-up trick applies.
- **No cron/background work** is needed — the app has none.

## Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| `relation "products" does not exist` | Database never seeded | Run step 3. |
| `no pg_hba.conf entry … no encryption` | TLS not negotiated | Make sure the host in `DATABASE_URL` isn't `localhost`; `db/client.ts` keys TLS off that. |
| `too many connections` | Direct (unpooled) string in production | Use the pooled connection string for `DATABASE_URL` in Vercel. |
| Chat streams nothing, 500 in logs | Missing/invalid provider key | Check Runtime Logs; or set `MOCK_LLM=true`. |
| Answer cuts off mid-plan | Model stopped early, or the 20-step agent cap | Check Runtime Logs; try a stronger model. Not the function timeout — that's 300s. |
| Env var change had no effect | Vercel bakes env at build | **Redeploy** after editing variables. |
