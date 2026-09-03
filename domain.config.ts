import type { DomainConfig } from './types';
import beautyConfig from './domain/beauty.config.json';
import electronicsConfig from './domain/electronics.config.json';

const configs: Record<string, DomainConfig> = {
  beauty: beautyConfig as DomainConfig,
  electronics: electronicsConfig as DomainConfig,
};

export function loadDomainConfig(): DomainConfig {
  // `||` not `??`: a variable set to an empty string (easy to do in a hosting
  // dashboard) should fall back to the default, not fail the lookup below.
  const domain = process.env.DOMAIN || 'beauty';
  const config = configs[domain];
  if (!config) {
    throw new Error(`Unknown domain "${domain}". Available: ${Object.keys(configs).join(', ')}`);
  }
  return config;
}
