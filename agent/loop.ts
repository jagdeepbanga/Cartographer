import { streamText, stepCountIs } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { openai } from '@ai-sdk/openai';
import { google } from '@ai-sdk/google';
import { openrouter } from '@openrouter/ai-sdk-provider';
import { loadDomainConfig } from '@/domain.config';
import { buildSystemPrompt } from './system-prompt';
import { buildTools } from './tool-registry';
import { runMockAgentLoop } from './mock-loop';
import type { SSEEvent, ChatMessage } from '@/types';

function getModel() {
  // `||` not `??` — an empty env var means "unset", not "a provider named ''".
  const provider = process.env.LLM_PROVIDER || 'openrouter';
  switch (provider) {
    case 'openai':
      return openai('gpt-4o');
    case 'google':
      return google('gemini-2.5-flash');
    case 'openrouter':
      // Defaults to a free, tool-capable model so no credit is needed to try it.
      // Any model slug from https://openrouter.ai/models works here.
      return openrouter(process.env.OPENROUTER_MODEL || 'minimax/minimax-m2.7:free');
    case 'anthropic':
    default:
      return anthropic('claude-sonnet-4-6');
  }
}

export async function runAgentLoop(
  messages: ChatMessage[],
  sessionId: string,
  send: (event: SSEEvent) => void
): Promise<ChatMessage[]> {
  if (process.env.MOCK_LLM === 'true') {
    return runMockAgentLoop(messages, sessionId, send);
  }

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

  // Forward text deltas and errors to the SSE stream. Tool execution (and its
  // custom SSE events, e.g. product_options) is handled inside each tool's execute fn.
  //
  // Some models occasionally narrate a product listing in text right before calling
  // search_products, duplicating what the product cards already show. We can't tell
  // that's happening until the following tool-call chunk arrives, so any text before
  // the first tool call is buffered and only forwarded once we know it wasn't
  // immediately followed by a search_products call.
  let pendingText = '';
  let sawSearchProducts = false;

  for await (const chunk of result.fullStream) {
    if (chunk.type === 'text-delta') {
      if (sawSearchProducts) {
        send({ type: 'text_delta', delta: chunk.text });
      } else {
        pendingText += chunk.text;
      }
    } else if (chunk.type === 'tool-call') {
      if (chunk.toolName === 'search_products') {
        sawSearchProducts = true;
        pendingText = ''; // discard — almost certainly a duplicate of the product cards
      } else if (!sawSearchProducts && pendingText) {
        send({ type: 'text_delta', delta: pendingText });
        pendingText = '';
      }
    } else if (chunk.type === 'tool-error') {
      console.error(`Tool "${chunk.toolName}" failed:`, chunk.error);
      throw new Error(`Tool "${chunk.toolName}" failed: ${String(chunk.error)}`);
    } else if (chunk.type === 'error') {
      throw new Error(String(chunk.error));
    }
  }

  if (!sawSearchProducts && pendingText) {
    send({ type: 'text_delta', delta: pendingText });
  }

  const response = await result.response;
  return response.messages;
}
