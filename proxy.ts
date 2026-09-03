import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Shared-password gate for the public demo deployment.
//
// The demo runs on a free OpenRouter tier with a hard daily request cap, so an
// openly reachable /api/chat is a quota that strangers can drain. This puts one
// password in front of everything — pages and API routes alike.
//
// Unset DEMO_PASSWORD disables the gate entirely, which keeps local development
// and the Docker image unchanged.

const REALM = 'Cartographer demo';

/** Constant-time string compare, so a wrong guess leaks nothing via timing. */
function matches(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

function unauthorized(): NextResponse {
  return new NextResponse('Authentication required.', {
    status: 401,
    headers: {
      // Triggers the browser's native username/password prompt. The browser then
      // replays the credentials on every subsequent same-origin request, so the
      // SSE chat stream is covered without any client-side changes.
      'WWW-Authenticate': `Basic realm="${REALM}", charset="UTF-8"`,
    },
  });
}

export function proxy(request: NextRequest) {
  const password = process.env.DEMO_PASSWORD;
  if (!password) return NextResponse.next();

  const header = request.headers.get('authorization');
  if (!header?.startsWith('Basic ')) return unauthorized();

  let decoded: string;
  try {
    decoded = atob(header.slice('Basic '.length));
  } catch {
    return unauthorized();
  }

  // Any username is accepted — the password is the whole secret, so there is one
  // credential to share rather than a pair to coordinate.
  const supplied = decoded.slice(decoded.indexOf(':') + 1);
  if (!matches(supplied, password)) return unauthorized();

  return NextResponse.next();
}

export const config = {
  // Everything except Next's own static output. Without this the gate would also
  // challenge CSS, JS and images, which breaks the page before it can render.
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
