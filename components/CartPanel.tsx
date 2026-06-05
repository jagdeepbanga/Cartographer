'use client';

import ProductImage from './ProductImage';
import type { CartItem } from '@/types';

type Props = {
  items: CartItem[];
  onClose?: () => void;
};

export default function CartPanel({ items, onClose }: Props) {
  const total = items.reduce((sum, item) => {
    const price = item.product ? Number(item.product.price) : 0;
    return sum + price * item.quantity;
  }, 0);

  return (
    <aside className="w-72 md:w-72 h-full shrink-0 border-l border-gray-100 bg-gray-50 flex flex-col">
      {/* Header */}
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Your cart</h2>
          <p className="text-xs text-gray-400 mt-0.5">{items.length} item{items.length !== 1 ? 's' : ''}</p>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-300 transition-colors text-sm"
          >
            ✕
          </button>
        )}
      </div>

      {/* Items */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
        {items.length === 0 && (
          <p className="text-xs text-gray-400">No items yet. Start chatting to build your cart.</p>
        )}
        {items.map((item) => (
          <div key={item.id} className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-lg overflow-hidden shrink-0">
              <ProductImage
                category={item.product?.category ?? ''}
                brand={item.product?.brand}
                size="sm"
              />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-gray-800 leading-snug line-clamp-2">
                {item.product?.name ?? 'Product'}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">{item.product?.brand}</p>
            </div>
            <span className="text-xs font-semibold text-gray-900 whitespace-nowrap">
              ${item.product ? Number(item.product.price).toFixed(2) : '—'}
            </span>
          </div>
        ))}
      </div>

      {/* Footer */}
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
