import { createSSEStream } from '@/lib/stream';
import { runAgentLoop } from '@/agent/loop';
import type { ChatMessage } from '@/types';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const { messages, sessionId } = (await req.json()) as {
    messages: ChatMessage[];
    sessionId: string;
  };

  if (!messages?.length || !sessionId) {
    return new Response('Missing messages or sessionId', { status: 400 });
  }

  return createSSEStream(async (send) => {
    await runAgentLoop(messages, sessionId, send);
  });
}
