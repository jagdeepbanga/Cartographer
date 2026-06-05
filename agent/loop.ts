import { streamText, stepCountIs } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { openai } from '@ai-sdk/openai';
import { google } from '@ai-sdk/google';
import { loadDomainConfig } from '@/domain.config';
import { buildSystemPrompt } from './system-prompt';
import { buildTools } from './tool-registry';
import type { SSEEvent, ChatMessage } from '@/types';

function getModel() {
  const provider = process.env.LLM_PROVIDER ?? 'anthropic';
  switch (provider) {
    case 'openai':
      return openai('gpt-4o');
    case 'google':
      return google('gemini-2.5-flash');
    case 'anthropic':
    default:
      return anthropic('claude-sonnet-4-6');
  }
}

export async function runAgentLoop(
  messages: ChatMessage[],
  sessionId: string,
  send: (event: SSEEvent) => void
): Promise<void> {
  const domain = loadDomainConfig();
  const systemPrompt = buildSystemPrompt(domain);
  const tools = buildTools(domain, sessionId, send);

  const result = streamText({
    model: getModel(),
    system: systemPrompt,
    messages,
    tools,
    stopWhen: stepCountIs(20),
  });

  // Forward text deltas and errors to the SSE stream.
  // Tool execution (and custom SSE events) is handled inside each tool's execute fn.
  for await (const chunk of result.fullStream) {
    if (chunk.type === 'text-delta') {
      send({ type: 'text_delta', delta: chunk.text });
    } else if (chunk.type === 'error') {
      throw new Error(String(chunk.error));
    }
  }
}
