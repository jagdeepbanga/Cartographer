import fs from 'fs';
import path from 'path';
import type { DomainConfig } from '@/types';
import { getProductLimit } from '@/lib/config';

const promptsDir = path.join(process.cwd(), 'agent/prompts');

function loadTemplate(domain: string): string {
  const domainPath = path.join(promptsDir, `${domain}.md`);
  if (fs.existsSync(domainPath)) {
    return fs.readFileSync(domainPath, 'utf8');
  }
  // Fallback to beauty prompt if no domain-specific file exists
  const fallbackPath = path.join(promptsDir, 'beauty.md');
  return fs.readFileSync(fallbackPath, 'utf8');
}

export function buildSystemPrompt(domain: DomainConfig): string {
  const template = loadTemplate(domain.domain);

  const facetDescriptions = domain.facets
    .map((f) => {
      const values = f.values ? ` (options: ${f.values.join(', ')})` : '';
      return `  - ${f.key} (${f.type})${values}: ${f.label}`;
    })
    .join('\n');

  return template
    .replaceAll('{{domain_label}}', domain.label)
    .replaceAll('{{product_limit}}', String(getProductLimit()))
    .replaceAll('{{categories}}', domain.categories.join(', '))
    .replaceAll('{{facets}}', facetDescriptions);
}
