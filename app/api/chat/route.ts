import { createSSEStream } from '@/lib/stream';
import { runAgentLoop } from '@/agent/loop';
import type { ChatMessage } from '@/types';

export const runtime = 'nodejs';
// The agent loop is multi-step and streams for as long as the model takes.
// Vercel's default is 300s on all plans (including Hobby); state it explicitly so
// the ceiling is visible here rather than inherited silently.
export const maxDuration = 300;

export async function POST(req: Request) {
  const { messages, sessionId } = (await req.json()) as {
    messages: ChatMessage[];
    sessionId: string;
  };

  if (!messages?.length || !sessionId) {
    return new Response('Missing messages or sessionId', { status: 400 });
  }

  return createSSEStream((send) => runAgentLoop(messages, sessionId, send));
}
