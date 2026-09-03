import { createSSEStream } from '@/lib/stream';
import { runAgentLoop } from '@/agent/loop';
import type { ChatMessage } from '@/types';

export const runtime = 'nodejs';
// The agent loop streams for as long as the model takes. 60s is the ceiling on
// Vercel's Hobby plan; raise it on paid plans if long plans get cut off.
export const maxDuration = 60;

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
