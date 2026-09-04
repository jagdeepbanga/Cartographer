import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveEmbeddingConfig, MissingEmbeddingKeyError } from './embeddings';

test('defaults to OpenAI — the default chat provider (Anthropic) has no embeddings API', () => {
  const config = resolveEmbeddingConfig({ OPENAI_API_KEY: 'sk-test' });
  assert.equal(config.provider, 'openai');
  assert.equal(config.model, 'text-embedding-3-small');
  assert.equal(config.dimensions, 1536);
});

test('embedding provider is independent of LLM_PROVIDER', () => {
  const config = resolveEmbeddingConfig({ LLM_PROVIDER: 'anthropic', OPENAI_API_KEY: 'sk-test' });
  assert.equal(config.provider, 'openai');
});

test('an empty EMBEDDING_PROVIDER means unset, not a provider named ""', () => {
  const config = resolveEmbeddingConfig({ EMBEDDING_PROVIDER: '', OPENAI_API_KEY: 'sk-test' });
  assert.equal(config.provider, 'openai');
});

test('provider and model are configurable', () => {
  const config = resolveEmbeddingConfig({
    EMBEDDING_PROVIDER: 'google',
    GOOGLE_GENERATIVE_AI_API_KEY: 'g-test',
  });
  assert.equal(config.provider, 'google');
  assert.equal(config.model, 'gemini-embedding-001');
  assert.equal(config.dimensions, 3072);
});

test('dimensions are overridable, and the override is passed to the provider', () => {
  const config = resolveEmbeddingConfig({ OPENAI_API_KEY: 'sk-test', EMBEDDING_DIMENSIONS: '512' });
  assert.equal(config.dimensions, 512);
  assert.deepEqual(config.providerOptions, { openai: { dimensions: 512 } });
});

test('no dimension override means no provider option — the model default stands', () => {
  const config = resolveEmbeddingConfig({ OPENAI_API_KEY: 'sk-test' });
  assert.deepEqual(config.providerOptions, {});
});

test('an unknown provider names itself and the valid choices', () => {
  assert.throws(() => resolveEmbeddingConfig({ EMBEDDING_PROVIDER: 'anthropic' }), (err: Error) => {
    assert.match(err.message, /anthropic/);
    assert.match(err.message, /EMBEDDING_PROVIDER/);
    assert.match(err.message, /openai/);
    return true;
  });
});

test('a nonsense EMBEDDING_DIMENSIONS fails loudly rather than silently defaulting', () => {
  assert.throws(
    () => resolveEmbeddingConfig({ OPENAI_API_KEY: 'sk-test', EMBEDDING_DIMENSIONS: 'lots' }),
    /EMBEDDING_DIMENSIONS/
  );
});

test('a missing key names the exact variable to set, not a generic auth error', () => {
  assert.throws(() => resolveEmbeddingConfig({}), (err: Error) => {
    assert.ok(err instanceof MissingEmbeddingKeyError);
    assert.match(err.message, /OPENAI_API_KEY/);
    assert.match(err.message, /EMBEDDING_PROVIDER/);
    return true;
  });
  assert.throws(
    () => resolveEmbeddingConfig({ EMBEDDING_PROVIDER: 'google' }),
    /GOOGLE_GENERATIVE_AI_API_KEY/
  );
});

test('an empty key is treated as missing', () => {
  assert.throws(() => resolveEmbeddingConfig({ OPENAI_API_KEY: '' }), MissingEmbeddingKeyError);
});

test('the key check can be waived — the schema needs only the width, not a key', () => {
  const config = resolveEmbeddingConfig({}, { requireKey: false });
  assert.equal(config.provider, 'openai');
  assert.equal(config.dimensions, 1536);
});

test('waiving the key check still validates provider and dimensions', () => {
  assert.throws(
    () => resolveEmbeddingConfig({ EMBEDDING_PROVIDER: 'anthropic' }, { requireKey: false }),
    /EMBEDDING_PROVIDER/
  );
  assert.throws(
    () => resolveEmbeddingConfig({ EMBEDDING_DIMENSIONS: '-1' }, { requireKey: false }),
    /EMBEDDING_DIMENSIONS/
  );
});
