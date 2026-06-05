'use client';

import { useState, useRef, useEffect } from 'react';
import AgentMessage from './AgentMessage';
import ProductOptions from './ProductOptions';
import type { SSEEvent, ChatMessage, Product, CartItem, ShoppingPlan } from '@/types';

type UIMessage =
  | { kind: 'user'; text: string }
  | { kind: 'agent'; text: string; streaming: boolean }
  | { kind: 'products'; products: Product[] }
  | { kind: 'plan'; plan: ShoppingPlan };

type Props = {
  sessionId: string;
  onCartUpdate: (item: CartItem) => void;
};

export default function ChatWindow({ sessionId, onCartUpdate }: Props) {
  const [messages, setMessages] = useState<UIMessage[]>([]);
  const [history, setHistory] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function sendMessage() {
    if (!input.trim() || loading) return;

    const userText = input.trim();
    setInput('');
    setLoading(true);

    const newHistory: ChatMessage[] = [...history, { role: 'user', content: userText }];
    setHistory(newHistory);
    setMessages((prev) => [...prev, { kind: 'user', text: userText }]);

    // Add a streaming agent message placeholder
    const agentIndex = messages.length + 1;
    setMessages((prev) => [...prev, { kind: 'agent', text: '', streaming: true }]);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newHistory, sessionId }),
      });

      if (!res.body) throw new Error('No response body');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let agentText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const event: SSEEvent = JSON.parse(line.slice(6));

          if (event.type === 'text_delta') {
            agentText += event.delta;
            setMessages((prev) => {
              const next = [...prev];
              next[agentIndex] = { kind: 'agent', text: agentText, streaming: true };
              return next;
            });
          } else if (event.type === 'shopping_plan') {
            setMessages((prev) => [...prev, { kind: 'plan', plan: event.plan }]);
          } else if (event.type === 'product_options') {
            setMessages((prev) => [...prev, { kind: 'products', products: event.products }]);
          } else if (event.type === 'cart_updated') {
            onCartUpdate(event.item);
          } else if (event.type === 'done') {
            setMessages((prev) => {
              const next = [...prev];
              if (next[agentIndex]?.kind === 'agent') {
                next[agentIndex] = { kind: 'agent', text: agentText, streaming: false };
              }
              return next;
            });
          }
        }
      }

      setHistory((prev) => [...prev, { role: 'assistant', content: agentText }]);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  function handleProductChoose(product: Product) {
    const text = `I'd like the ${product.name}`;
    setInput(text);
  }

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Message list */}
      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-5">
        {messages.length === 0 && (
          <div className="text-center text-gray-400 text-sm mt-16">
            <p className="font-medium text-gray-600">Welcome to Cartographer</p>
            <p className="mt-1">Tell me what you&apos;re looking for and I&apos;ll help you build your cart.</p>
            <p className="mt-3 text-xs text-gray-300">Try: &quot;I&apos;m 30 with sensitive skin. I need a daily face routine under $150.&quot;</p>
          </div>
        )}

        {messages.map((msg, i) => {
          if (msg.kind === 'user') {
            return (
              <div key={i} className="flex justify-end">
                <div className="bg-gray-900 text-white text-sm rounded-2xl rounded-tr-sm px-4 py-2.5 max-w-sm">
                  {msg.text}
                </div>
              </div>
            );
          }
          if (msg.kind === 'agent') {
            return <AgentMessage key={i} text={msg.text} streaming={msg.streaming} />;
          }
          if (msg.kind === 'products') {
            return <ProductOptions key={i} products={msg.products} onChoose={handleProductChoose} />;
          }
          if (msg.kind === 'plan') {
            return (
              <div key={i} className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-sm">
                <p className="font-semibold text-gray-700 mb-2">Shopping plan</p>
                <p className="text-gray-500 mb-3">{msg.plan.goal}</p>
                <div className="space-y-1">
                  {msg.plan.categories.map((cat) => (
                    <div key={cat.name} className="flex justify-between text-xs text-gray-600">
                      <span className="capitalize">{cat.name}</span>
                      <span className="text-gray-400">${cat.budget_min}–${cat.budget_max}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-3 pt-3 border-t border-gray-200 flex justify-between text-xs font-semibold text-gray-700">
                  <span>Total budget</span>
                  <span>${msg.plan.total_budget_aud}</span>
                </div>
              </div>
            );
          }
          return null;
        })}

        <div ref={bottomRef} />
      </div>

      {/* Input bar */}
      <div className="border-t border-gray-100 px-4 py-3 flex gap-3 items-end">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              sendMessage();
            }
          }}
          placeholder="Tell me what you need..."
          rows={1}
          className="flex-1 resize-none rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
        />
        <button
          onClick={sendMessage}
          disabled={loading || !input.trim()}
          className="rounded-xl bg-gray-900 text-white text-sm font-medium px-5 py-3 hover:bg-gray-700 disabled:opacity-40 transition-colors"
        >
          Send
        </button>
      </div>
    </div>
  );
}
