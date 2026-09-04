import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildProductDocument, embeddingFingerprint } from './document';

const model = { provider: 'openai', model: 'text-embedding-3-small', dimensions: 1536 };

const product = {
  name: 'CeraVe Hydrating Facial Cleanser',
  brand: 'CeraVe',
  category: 'cleanser',
  description: 'A gentle, non-foaming cleanser.',
  attributes: { skin_type: 'dry', fragrance_free: true, cruelty_free: false },
};

test('the document carries every field the shopper might describe', () => {
  const doc = buildProductDocument(product);
  assert.match(doc, /CeraVe Hydrating Facial Cleanser/);
  assert.match(doc, /CeraVe/);
  assert.match(doc, /cleanser/);
  assert.match(doc, /gentle, non-foaming/);
});

test('facets are rendered as readable text, not key=value pairs', () => {
  const doc = buildProductDocument(product);
  assert.match(doc, /skin type: dry/);
  // A true boolean facet reads as the claim itself; a false one as its negation.
  assert.match(doc, /fragrance free/);
  assert.match(doc, /not cruelty free/);
  assert.doesNotMatch(doc, /fragrance_free/);
});

test('the document is stable across calls, so hashes compare cleanly', () => {
  assert.equal(buildProductDocument(product), buildProductDocument({ ...product }));
});

test('facet ordering does not change the document', () => {
  const reordered = {
    ...product,
    attributes: { cruelty_free: false, fragrance_free: true, skin_type: 'dry' },
  };
  assert.equal(buildProductDocument(reordered), buildProductDocument(product));
});

test('missing optional fields are omitted rather than rendered as "null"', () => {
  const doc = buildProductDocument({
    name: 'Mystery Product',
    brand: null,
    category: 'serum',
    description: null,
    attributes: {},
  });
  assert.match(doc, /Mystery Product/);
  assert.doesNotMatch(doc, /null|undefined/);
});

const fingerprint = (p: typeof product, m = model) => embeddingFingerprint(buildProductDocument(p), m);

test('the fingerprint changes when any embedded text changes', () => {
  const base = fingerprint(product);
  assert.equal(base, fingerprint({ ...product }));
  assert.notEqual(base, fingerprint({ ...product, description: 'Reformulated.' }));
  assert.notEqual(
    base,
    fingerprint({ ...product, attributes: { ...product.attributes, skin_type: 'oily' } })
  );
});

test('the fingerprint changes when the model does — vectors from two models are not interchangeable', () => {
  const base = fingerprint(product);
  assert.notEqual(base, fingerprint(product, { ...model, model: 'text-embedding-3-large' }));
  assert.notEqual(base, fingerprint(product, { ...model, provider: 'google' }));
  assert.notEqual(base, fingerprint(product, { ...model, dimensions: 512 }));
});
