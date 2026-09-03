import { Pool } from 'pg';

const connectionString = process.env.DATABASE_URL;

// Managed Postgres (Neon, Supabase, RDS) requires TLS; a local/compose Postgres
// does not offer it. Enable it for everything except localhost.
const isLocal = /@(localhost|127\.0\.0\.1|db):/.test(connectionString ?? '');

export const db = new Pool({
  connectionString,
  ssl: isLocal ? undefined : { rejectUnauthorized: false },
  // On Vercel each serverless invocation gets its own container, so a large pool
  // per instance just exhausts the database's connection limit. Keep it small and
  // let idle connections drop quickly.
  max: process.env.VERCEL ? 1 : 10,
  idleTimeoutMillis: 10_000,
  connectionTimeoutMillis: 10_000,
});
