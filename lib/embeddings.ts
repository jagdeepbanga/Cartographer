import { embedMany } from 'ai';
import type { JSONValue } from 'ai';
import { openai } from '@ai-sdk/openai';
import { google } from '@ai-sdk/google';

// Embedding provider selection is deliberately SEPARATE from `LLM_PROVIDER`.
// Anthropic is the default chat provider and ships no embeddings API at all, so
// a single knob would leave the default configuration unable to seed. Chat and
// embeddings are chosen independently, and default independently.
const PROVIDERS = {
  openai: {
    model: 'text-embedding-3-small',
    dimensions: 1536,
    keyVar: 'OPENAI_API_KEY',
    // OpenAI's v3 models are Matryoshka-trained: a shorter vector is a valid
    // truncation, not a different model.
    dimensionOption: (dimensions: number) => ({ openai: { dimensions } }),
  },
  google: {
    model: 'gemini-embedding-001',
    dimensions: 3072,
    keyVar: 'GOOGLE_GENERATIVE_AI_API_KEY',
    dimensionOption: (dimensions: number) => ({ google: { outputDimensionality: dimensions } }),
  },
} as const;

export type EmbeddingProvider = keyof typeof PROVIDERS;

export interface EmbeddingConfig {
  provider: EmbeddingProvider;
  model: string;
  dimensions: number;
  providerOptions: Record<string, Record<string, JSONValue>>;
}

/** Thrown when the configured provider's API key is absent — see the seed scripts. */
export class MissingEmbeddingKeyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MissingEmbeddingKeyError';
  }
}

type Env = Record<string, string | undefined>;

/**
 * Resolve provider, model and vector width from the environment.
 *
 * `requireKey: false` is for callers that only need the width — applying the
 * schema, say — and must not fail on a missing key. Everything that actually
 * calls the API leaves it on, so a missing key surfaces before any row is written.
 */
export function resolveEmbeddingConfig(
  env: Env = process.env,
  { requireKey = true }: { requireKey?: boolean } = {}
): EmbeddingConfig {
  // `||` not `??` throughout — a variable set to an empty string (easy to do in a
  // hosting dashboard) means "unset", not "a provider named ''".
  const name = env.EMBEDDING_PROVIDER || 'openai';
  if (!(name in PROVIDERS)) {
    throw new Error(
      `Unknown EMBEDDING_PROVIDER "${name}". Available: ${Object.keys(PROVIDERS).join(', ')}. ` +
        'Note this is separate from LLM_PROVIDER — Anthropic has no embeddings API.'
    );
  }
  const provider = name as EmbeddingProvider;
  const defaults = PROVIDERS[provider];

  const model = env.EMBEDDING_MODEL || defaults.model;

  const rawDimensions = env.EMBEDDING_DIMENSIONS || '';
  const overridden = rawDimensions.length > 0;
  const dimensions = overridden ? Number(rawDimensions) : defaults.dimensions;
  if (!Number.isInteger(dimensions) || dimensions <= 0) {
    throw new Error(
      `EMBEDDING_DIMENSIONS must be a positive integer, got "${rawDimensions}". ` +
        `Leave it unset to use ${model}'s default of ${defaults.dimensions}.`
    );
  }

  if (requireKey && !env[defaults.keyVar]) {
    throw new MissingEmbeddingKeyError(
      `${defaults.keyVar} is not set, but EMBEDDING_PROVIDER is "${provider}". ` +
        `Set ${defaults.keyVar} in .env.local (or the shell running the seed), or set ` +
        'EMBEDDING_PROVIDER to a provider whose key you do have ' +
        `(${Object.keys(PROVIDERS).join(', ')}). ` +
        'To seed without embeddings for the zero-key demo, set MOCK_LLM=true.'
    );
  }

  return {
    provider,
    model,
    dimensions,
    // Only sent when explicitly overridden: passing an explicit size to a model
    // that does not support truncation is an API error, not a no-op.
    providerOptions: overridden ? defaults.dimensionOption(dimensions) : {},
  };
}

function embeddingModel(config: EmbeddingConfig) {
  switch (config.provider) {
    // No `default`: adding a provider to PROVIDERS without wiring it here should
    // be a compile error, not a silent fall-through to OpenAI.
    case 'google':
      return google.textEmbedding(config.model);
    case 'openai':
      return openai.textEmbedding(config.model);
  }
}

/**
 * Embed a batch of documents. `embedMany` splits the batch into as many API calls
 * as the provider's per-call limit requires, and returns embeddings in input order.
 */
export async function embedTexts(
  texts: string[],
  config: EmbeddingConfig = resolveEmbeddingConfig()
): Promise<number[][]> {
  if (texts.length === 0) return [];

  const { embeddings } = await embedMany({
    model: embeddingModel(config),
    values: texts,
    providerOptions: config.providerOptions,
    maxParallelCalls: 4,
  });

  const mismatched = embeddings.find((embedding) => embedding.length !== config.dimensions);
  if (mismatched) {
    throw new Error(
      `${config.model} returned ${mismatched.length}-dimension vectors but the schema expects ` +
        `${config.dimensions}. Set EMBEDDING_DIMENSIONS=${mismatched.length} and re-create the ` +
        'embedding column (see "Changing the embedding model" in the README).'
    );
  }

  return embeddings;
}

/** Postgres `vector` literal — pgvector parses the same bracketed form it prints. */
export function toVectorLiteral(embedding: number[]): string {
  return `[${embedding.join(',')}]`;
}
