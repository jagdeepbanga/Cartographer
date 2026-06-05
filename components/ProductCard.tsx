'use client';

import { useState } from 'react';
import ProductImage from './ProductImage';
import ProductModal from './ProductModal';
import type { Product } from '@/types';

type Props = {
  product: Product;
  onChoose: (product: Product) => void;
};

export default function ProductCard({ product, onChoose }: Props) {
  const [showModal, setShowModal] = useState(false);

  return (
    <>
      <div className="border border-gray-200 rounded-xl overflow-hidden flex flex-col bg-white shadow-sm hover:shadow-md transition-shadow">
        {/* Product illustration */}
        <div className="h-40">
          <ProductImage category={product.category} brand={product.brand} size="lg" />
        </div>

        {/* Details */}
        <div className="p-4 flex flex-col gap-2 flex-1">
          <div className="flex justify-between items-start gap-2">
            <div className="min-w-0">
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wide truncate">{product.brand}</p>
              <h3 className="text-sm font-semibold text-gray-900 leading-snug mt-0.5 line-clamp-2">{product.name}</h3>
            </div>
            <span className="text-sm font-bold text-gray-900 whitespace-nowrap">
              ${Number(product.price).toFixed(2)}
            </span>
          </div>

          {product.description && (
            <p className="text-xs text-gray-500 leading-relaxed line-clamp-2">{product.description}</p>
          )}

          <div className="mt-auto flex gap-2 pt-1">
            <button
              onClick={() => setShowModal(true)}
              className="flex-1 rounded-lg border border-gray-200 text-gray-600 text-xs font-medium py-2 hover:bg-gray-50 transition-colors"
            >
              View details
            </button>
            <button
              onClick={() => onChoose(product)}
              className="flex-1 rounded-lg bg-gray-900 text-white text-xs font-medium py-2 hover:bg-gray-700 transition-colors"
            >
              Choose this
            </button>
          </div>
        </div>
      </div>

      {showModal && (
        <ProductModal
          product={product}
          onChoose={onChoose}
          onClose={() => setShowModal(false)}
        />
      )}
    </>
  );
}
