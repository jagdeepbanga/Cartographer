export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Liveness probe for App Runner's health check.
//
// Deliberately does NOT touch Postgres: a transient DB problem should not cause
// the platform to kill and replace containers that are otherwise serving fine —
// that turns a database blip into a full outage. Use /api/ready for DB status.
export function GET() {
  return Response.json(
    { status: 'ok' },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
