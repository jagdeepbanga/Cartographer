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

  useEffect(() => {
    setSessionId(getSessionId());
  }, []);

  const handleCartUpdate = useCallback((item: CartItem) => {
    setCartItems((prev) => [...prev, item]);
  }, []);

  if (!sessionId) return null;

  return (
    <div className="flex h-screen overflow-hidden bg-white">
      <ChatWindow sessionId={sessionId} onCartUpdate={handleCartUpdate} />
      <CartPanel items={cartItems} />
    </div>
  );
}
