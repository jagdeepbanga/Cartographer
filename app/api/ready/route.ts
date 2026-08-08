import { db } from '@/db/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Readiness probe — verifies the app can actually reach Postgres. Useful for
// debugging a deploy by hand (`curl .../api/ready`); not wired to App Runner's
// health check, so a DB outage won't trigger a restart loop. See /api/health.
export async function GET() {
  try {
    await db.query('SELECT 1');
    return Response.json(
      { status: 'ok', database: 'reachable' },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return Response.json(
      { status: 'degraded', database: 'unreachable', error: message },
      { status: 503, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
