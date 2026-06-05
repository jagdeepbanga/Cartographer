import type { Product } from '@/types';
import ProductCard from './ProductCard';

type Props = {
  products: Product[];
  onChoose: (product: Product) => void;
};

export default function ProductOptions({ products, onChoose }: Props) {
  return (
    <div className="grid grid-cols-2 gap-3 my-3">
      {products.map((product) => (
        <ProductCard key={product.id} product={product} onChoose={onChoose} />
      ))}
    </div>
  );
}
