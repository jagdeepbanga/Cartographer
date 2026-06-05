import type { Product } from '@/types';

type Props = {
  product: Product;
  onChoose: (product: Product) => void;
};

export default function ProductCard({ product, onChoose }: Props) {
  return (
    <div className="border border-gray-200 rounded-xl p-4 flex flex-col gap-3 bg-white shadow-sm hover:shadow-md transition-shadow">
      <div className="flex justify-between items-start">
        <div>
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">{product.brand}</p>
          <h3 className="text-sm font-semibold text-gray-900 leading-snug mt-0.5">{product.name}</h3>
        </div>
        <span className="text-sm font-bold text-gray-900 whitespace-nowrap ml-2">
          ${Number(product.price).toFixed(2)}
        </span>
      </div>

      {product.description && (
        <p className="text-xs text-gray-500 leading-relaxed line-clamp-3">{product.description}</p>
      )}

      <button
        onClick={() => onChoose(product)}
        className="mt-auto w-full rounded-lg bg-gray-900 text-white text-sm font-medium py-2 hover:bg-gray-700 transition-colors"
      >
        Choose this
      </button>
    </div>
  );
}
