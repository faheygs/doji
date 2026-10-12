import type { Metadata } from 'next';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { SafetyForm } from './SafetyForm';
export const metadata: Metadata = {
  title: 'Safety and Removal Center',
  description:
    'Report content or an account on Doji and request review or removal. No Doji account required.',
  alternates: { canonical: '/safety-removal/' },
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};
export default async function SafetyPage() {
  const html = await readFile(
    resolve(process.cwd(), '../../../website/safety-removal/index.html'),
    'utf8',
  );
  const content = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/)?.[1];
  if (!content || /<script\b|\son\w+\s*=|javascript:/i.test(content))
    throw Error('Safety form failed static validation');
  return <SafetyForm content={content} />;
}
