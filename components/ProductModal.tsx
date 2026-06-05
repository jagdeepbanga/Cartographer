'use client';

import { useEffect } from 'react';
import ProductImage from './ProductImage';
import type { Product } from '@/types';

type Props = {
  product: Product;
  onChoose: (product: Product) => void;
  onClose: () => void;
};

export default function ProductModal({ product, onChoose, onClose }: Props) {
  // Close on Escape key
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const attrs = product.attributes as Record<string, string | number | boolean>;

  function formatAttrLabel(key: string) {
    return key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }

  function formatAttrValue(key: string, value: string | number | boolean) {
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    if (key === 'spf_rating') return `SPF ${value}`;
    return String(value).replace(/\b\w/g, (c) => c.toUpperCase());
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end md:items-center justify-center md:p-4"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />

      {/* Modal — bottom sheet on mobile, centered card on desktop */}
      <div
        className="relative bg-white w-full md:max-w-md rounded-t-2xl md:rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag handle (mobile only) */}
        <div className="flex justify-center pt-3 pb-1 md:hidden">
          <div className="w-10 h-1 rounded-full bg-gray-300" />
        </div>

        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 z-10 w-8 h-8 rounded-full bg-white/80 backdrop-blur flex items-center justify-center text-gray-500 hover:text-gray-900 hover:bg-white transition-colors shadow-sm"
        >
          ✕
        </button>

        {/* Product image */}
        <div className="h-44 md:h-52 shrink-0">
          <ProductImage category={product.category} brand={product.brand} size="lg" />
        </div>

        {/* Details — scrollable on mobile */}
        <div className="p-5 space-y-4 overflow-y-auto">
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">{product.brand}</p>
            <h2 className="text-lg font-bold text-gray-900 leading-snug mt-1">{product.name}</h2>
            <p className="text-xl font-bold text-gray-900 mt-1">${Number(product.price).toFixed(2)}</p>
          </div>

          {product.description && (
            <p className="text-sm text-gray-600 leading-relaxed">{product.description}</p>
          )}

          {/* Attribute badges */}
          {Object.keys(attrs).length > 0 && (
            <div className="flex flex-wrap gap-2">
              {Object.entries(attrs).map(([k, v]) => {
                if (k === 'spf_rating' && !v) return null;
                return (
                  <span
                    key={k}
                    className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-gray-100 text-gray-600 font-medium"
                  >
                    <span className="text-gray-400">{formatAttrLabel(k)}:</span>
                    {formatAttrValue(k, v)}
                  </span>
                );
              })}
            </div>
          )}

          {/* CTA */}
          <button
            onClick={() => { onChoose(product); onClose(); }}
            className="w-full rounded-xl bg-gray-900 text-white font-semibold py-3 hover:bg-gray-700 transition-colors"
          >
            Choose this product
          </button>
        </div>
      </div>
    </div>
  );
}
