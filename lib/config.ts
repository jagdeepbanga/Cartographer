export function getProductLimit(): number {
  const raw = process.env.PRODUCT_LIMIT;
  const parsed = raw ? parseInt(raw, 10) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 3;
}

/**
 * The zero-key demo: no LLM calls, no embedding calls, a scripted agent loop.
 * Read here rather than at each use site so all three callers agree on what
 * counts as "on".
 */
export function isMockMode(): boolean {
  return process.env.MOCK_LLM === 'true';
}
