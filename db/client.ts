import { Pool } from 'pg';
import fs from 'fs';
import path from 'path';

// Managed Postgres (RDS) rejects unencrypted connections — RDS PostgreSQL 15+
// ships `rds.force_ssl=1` by default. Local Postgres doesn't speak TLS at all,
// so infer the default from the host and let PGSSLMODE override it explicitly.
const LOCAL_HOSTS = ['localhost', '127.0.0.1', '::1', 'db'];

function useSSL(connectionString: string | undefined): boolean {
  const mode = process.env.PGSSLMODE;
  if (mode) return mode !== 'disable';
  if (!connectionString) return false;

  try {
    return !LOCAL_HOSTS.includes(new URL(connectionString).hostname);
  } catch {
    return false;
  }
}

// Amazon's CA bundle, committed at certs/ and copied into the runtime image.
// Verifying against it is what makes TLS meaningful — `rejectUnauthorized: false`
// would encrypt the connection while accepting any certificate presented.
//
// Keep this path a static literal. Next's build-time file tracer reads it to
// decide what to bundle into the standalone output; anything it can't resolve
// statically (an env-var override, a computed segment) makes it give up and
// trace the entire repo into the image.
function readCA(): string {
  return fs.readFileSync(
    path.join(process.cwd(), 'certs', 'rds-global-bundle.pem'),
    'utf8'
  );
}

const connectionString = process.env.DATABASE_URL;

export const db = new Pool({
  connectionString,
  // App Runner runs N instances, each with its own pool. Keep max low so
  // N × max stays well under the instance class's max_connections (~85 on
  // db.t4g.micro).
  max: Number(process.env.PG_POOL_MAX ?? 5),
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
  ssl: useSSL(connectionString) ? { ca: readCA() } : false,
});

// An idle connection dropped by the server (RDS failover, network blip) emits an
// error on the pool with no query to attach it to. Without this listener Node
// treats it as unhandled and kills the process.
db.on('error', (err) => {
  console.error('Postgres pool error:', err.message);
});
