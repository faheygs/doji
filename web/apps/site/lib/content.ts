import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

// Build-time, repository-owned content only. Never accepts HTML from a request.
export const policyRoutes = [
  'privacy',
  'terms',
  'community-guidelines',
  'child-safety',
  'support',
  'delete-account',
  'delete-data',
] as const;
export async function publicContent(slug: string) {
  if (!policyRoutes.some((route) => route === slug)) throw Error('Unknown public document');
  const html = await readFile(resolve(process.cwd(), 'generated', `${slug}.html`), 'utf8');
  const body = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/)?.[1];
  const title = html.match(/<title>([^<]+)<\/title>/)?.[1];
  const description = html.match(/<meta name="description" content="([^"]+)"/)?.[1];
  if (!body || !title || !description || /<script\b|\son\w+\s*=|javascript:/i.test(body))
    throw Error('Public content failed validation');
  return { body, title, description };
}

export interface SafetyCategory {
  value: string;
  label: string;
  details: { value: string; label: string; restricted: boolean }[];
}
export async function safetyCategories(): Promise<SafetyCategory[]> {
  const source = await readFile(
    resolve(process.cwd(), '../../../website/safety-removal/taxonomy.mts'),
    'utf8',
  );
  const serialized = source.match(/window\.DojiReportTaxonomy = (\[[\s\S]*\]);\s*$/)?.[1];
  if (!serialized) throw Error('Safety taxonomy missing');
  return JSON.parse(serialized);
}
