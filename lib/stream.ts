import type { SSEEvent, ChatMessage } from '@/types';

export function encodeSSE(event: SSEEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

export function createSSEStream(
  handler: (send: (event: SSEEvent) => void) => Promise<ChatMessage[]>
): Response {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: SSEEvent) => {
        controller.enqueue(encoder.encode(encodeSSE(event)));
      };

      try {
        const messages = await handler(send);
        send({ type: 'done', messages });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        send({ type: 'error', message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      // `no-transform` stops intermediaries compressing/buffering the stream and
      // `X-Accel-Buffering` opts out of nginx-style proxy buffering. Without
      // these, a proxy can hold the whole response until the agent finishes —
      // turning word-by-word streaming into one delayed block of text.
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
      Connection: 'keep-alive',
    },
  });
}
