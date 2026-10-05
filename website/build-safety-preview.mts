// Local preview artifact only. No deployment or live configuration.
import { mkdir, cp, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { readBrowserSource } from './browser-source.mts';
const root = resolve(import.meta.dirname),
  out = resolve(root, '.safety-preview');
await mkdir(out, { recursive: true });
for (const item of [
  'assets',
  'styles.css',
  'portal.css',
  'portal-select.js',
  'safety-removal',
  'privacy',
  'terms',
  'support',
  'community-guidelines',
]) {
  if (item.endsWith('.js')) await writeFile(join(out, item), readBrowserSource(item));
  else await cp(join(root, item), join(out, item), { recursive: true, filter: path=>!path.endsWith('.mts') });
}
for(const name of ['form','taxonomy']) await writeFile(join(out,`safety-removal/${name}.js`),readBrowserSource(`safety-removal/${name}.js`));
const previewHtml = (await readFile(join(root, 'safety-removal/index.html'), 'utf8')).replace(
  '<main id="main" class="shell safetyShell">',
  '<main id="main" class="shell safetyShell"><aside class="safetyPreview" aria-label="Preview notice"><strong>Design preview</strong><span>Not live · Submissions disabled · No cases or emails are created.</span></aside>',
);
await writeFile(join(out, 'index.html'), previewHtml);
await writeFile(join(out, 'safety-removal/index.html'), previewHtml);
await writeFile(
  join(out, 'safety-removal/config.js'),
  'window.DOJI_SAFETY_CONFIG = { enabled: false, preview: true, endpoint: "", siteKey: "" };\n',
);
let headers = await readFile(join(root, '_headers'), 'utf8');
headers = headers
  .replace("script-src 'self'", "script-src 'self' https://challenges.cloudflare.com")
  .replace('; base-uri', '; frame-src https://challenges.cloudflare.com; base-uri')
  .replace('Referrer-Policy: strict-origin-when-cross-origin', 'Referrer-Policy: no-referrer');
await writeFile(join(out, '_headers'), headers);
console.log(`Local-only safety preview: ${out}`);
