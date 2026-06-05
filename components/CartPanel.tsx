'use client';

import type { CartItem } from '@/types';

type Props = {
  items: CartItem[];
};

export default function CartPanel({ items }: Props) {
  const total = items.reduce((sum, item) => {
    const price = item.product ? Number(item.product.price) : 0;
    return sum + price * item.quantity;
  }, 0);

  return (
    <aside className="w-72 shrink-0 border-l border-gray-100 bg-gray-50 flex flex-col">
      <div className="px-5 py-4 border-b border-gray-100">
        <h2 className="text-sm font-semibold text-gray-900">Your cart</h2>
        <p className="text-xs text-gray-400 mt-0.5">{items.length} item{items.length !== 1 ? 's' : ''}</p>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
        {items.length === 0 && (
          <p className="text-xs text-gray-400">No items yet. Start chatting to build your cart.</p>
        )}
        {items.map((item) => (
          <div key={item.id} className="flex justify-between items-start gap-2">
            <div>
              <p className="text-xs font-medium text-gray-800 leading-snug">{item.product?.name ?? 'Product'}</p>
              <p className="text-xs text-gray-400">{item.product?.brand}</p>
            </div>
            <span className="text-xs font-semibold text-gray-900 whitespace-nowrap">
              ${item.product ? Number(item.product.price).toFixed(2) : '—'}
            </span>
          </div>
        ))}
      </div>

      {items.length > 0 && (
        <div className="px-5 py-4 border-t border-gray-100">
          <div className="flex justify-between items-center">
            <span className="text-sm font-semibold text-gray-900">Total</span>
            <span className="text-sm font-bold text-gray-900">${total.toFixed(2)}</span>
          </div>
          <button className="mt-3 w-full rounded-lg bg-gray-900 text-white text-sm font-medium py-2.5 hover:bg-gray-700 transition-colors">
            Checkout
          </button>
        </div>
      )}
    </aside>
  );
}
