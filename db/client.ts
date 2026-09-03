import { Pool } from 'pg';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  // Without this, `pg` silently falls back to localhost and every query fails
  // with ECONNREFUSED 127.0.0.1:5432 — which reads like a networking problem
  // rather than a missing/empty environment variable.
  throw new Error(
    'DATABASE_URL is not set. On Vercel, connect a Postgres database under ' +
      'Storage, then redeploy — environment variables are applied at build time.'
  );
}

// Managed Postgres (Neon, Supabase, RDS) requires TLS; a local/compose Postgres
// does not offer it. Enable it for everything except localhost.
const isLocal = /@(localhost|127\.0\.0\.1|db):/.test(connectionString);

export const db = new Pool({
  connectionString,
  ssl: isLocal ? undefined : { rejectUnauthorized: false },
  // Fluid Compute reuses a function instance across concurrent requests, so a
  // pool of 1 would serialise queries behind each other. Keep a few connections
  // per instance — enough for concurrency, small enough that the instances Vercel
  // does spin up don't exhaust the database's connection limit. Pair this with the
  // provider's pooled connection string (Neon: the `-pooler` host).
  max: process.env.VERCEL ? 5 : 10,
  idleTimeoutMillis: 10_000,
  connectionTimeoutMillis: 10_000,
});
