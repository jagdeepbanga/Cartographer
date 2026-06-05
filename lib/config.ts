export function getProductLimit(): number {
  const raw = process.env.PRODUCT_LIMIT;
  const parsed = raw ? parseInt(raw, 10) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 3;
}
