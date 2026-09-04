import { createHash } from 'node:crypto';

/** The subset of a product row that contributes to its embedding. */
export interface EmbeddableProduct {
  name: string;
  brand?: string | null;
  category: string;
  description?: string | null;
  attributes?: Record<string, unknown> | null;
}

// Chunking decision: ONE embedding per product, over the whole record — no
// sub-document chunks.
//
// A product here is already the smallest self-contained unit a shopper reasons
// about: a name, a brand, a category, a paragraph of description, and a handful
// of facets. Splitting that into chunks would scatter one coherent record across
// several vectors, so a query like "something for redness that doesn't sting"
// would match a description fragment that no longer knows which product it came
// from, and near-duplicate chunks of the same product would crowd out other
// products in the top k. Fragmenting a paragraph costs precision without buying
// recall.
//
// This is the right call *because descriptions are short*. If catalogue copy ever
// grows into long-form content (full ingredient breakdowns, reviews, buying
// guides), a single vector would start averaging away the specific passage that
// answers the query, and per-section chunking with a product-level parent link
// would win instead.
//
// The facets are rendered as readable English rather than `key=value` pairs
// because embedding models are trained on prose: "fragrance free, not cruelty
// free" sits in a far more useful part of the space than "fragrance_free: true".
export function buildProductDocument(product: EmbeddableProduct): string {
  const lines = [
    product.name,
    product.brand ? `Brand: ${product.brand}` : null,
    `Category: ${product.category}`,
    product.description || null,
    renderFacets(product.attributes),
  ];

  return lines.filter((line): line is string => Boolean(line)).join('\n');
}

function renderFacets(attributes: EmbeddableProduct['attributes']): string | null {
  const entries = Object.entries(attributes ?? {});
  if (entries.length === 0) return null;

  // Sorted by key so the document — and therefore its hash — does not depend on
  // JSONB key ordering, which Postgres does not preserve.
  const rendered = entries
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => {
      const label = key.replace(/_/g, ' ');
      if (value === true) return label;
      if (value === false) return `not ${label}`;
      if (value === null || value === undefined) return null;
      return `${label}: ${String(value)}`;
    })
    .filter((facet): facet is string => Boolean(facet));

  return rendered.length ? rendered.join(', ') : null;
}

/** The parts of the embedding configuration that change what a vector means. */
export interface EmbeddingIdentity {
  provider: string;
  model: string;
  dimensions: number;
}

/**
 * Fingerprint of the embedded text *and* the model that embedded it. Stored
 * alongside the vector so re-seeding can tell "already embedded, nothing changed"
 * from "needs re-embedding" without calling the embedding API to find out.
 *
 * The model belongs in the fingerprint because two models put the same text in
 * different vector spaces. Hashing the text alone would let a model swap at equal
 * width pass as "unchanged", leaving the table full of vectors that no longer
 * live in the space queries are embedded into — retrieval would return nonsense
 * with nothing anywhere reporting an error.
 */
export function embeddingFingerprint(document: string, identity: EmbeddingIdentity): string {
  return createHash('sha256')
    .update(`${identity.provider}/${identity.model}/${identity.dimensions}\n${document}`)
    .digest('hex');
}
