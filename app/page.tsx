'use client';

import { useState, useCallback, useEffect } from 'react';
import ChatWindow from '@/components/ChatWindow';
import CartPanel from '@/components/CartPanel';
import type { CartItem } from '@/types';

function getSessionId(): string {
  const key = 'cartographer_session';
  const existing = sessionStorage.getItem(key);
  if (existing) return existing;
  const id = crypto.randomUUID();
  sessionStorage.setItem(key, id);
  return id;
}

export default function Home() {
  const [sessionId, setSessionId] = useState('');
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [cartOpen, setCartOpen] = useState(false);

  useEffect(() => {
    setSessionId(getSessionId());
  }, []);

  const handleCartUpdate = useCallback((item: CartItem) => {
    setCartItems((prev) => [...prev, item]);
    setCartOpen(true); // auto-open cart on mobile when item added
  }, []);

  if (!sessionId) return null;

  return (
    <div className="flex h-screen overflow-hidden bg-white">
      {/* Chat takes full width on mobile, shrinks on desktop */}
      <div className="flex-1 flex flex-col min-w-0 relative">
        <ChatWindow sessionId={sessionId} onCartUpdate={handleCartUpdate} />

        {/* Mobile cart button — hidden on md+ */}
        <button
          onClick={() => setCartOpen(true)}
          className="md:hidden fixed bottom-20 right-4 z-30 flex items-center gap-2 bg-gray-900 text-white text-sm font-medium px-4 py-2.5 rounded-full shadow-lg"
        >
          <span>🛒</span>
          <span>Cart</span>
          {cartItems.length > 0 && (
            <span className="bg-white text-gray-900 text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center">
              {cartItems.length}
            </span>
          )}
        </button>
      </div>

      {/* Desktop: persistent sidebar */}
      <div className="hidden md:block">
        <CartPanel items={cartItems} />
      </div>

      {/* Mobile: slide-in drawer */}
      {cartOpen && (
        <div className="md:hidden fixed inset-0 z-40 flex">
          {/* Backdrop */}
          <div
            className="flex-1 bg-black/40"
            onClick={() => setCartOpen(false)}
          />
          {/* Drawer */}
          <div className="w-80 max-w-[90vw] h-full bg-white shadow-xl">
            <CartPanel items={cartItems} onClose={() => setCartOpen(false)} />
          </div>
        </div>
      )}
    </div>
  );
}
