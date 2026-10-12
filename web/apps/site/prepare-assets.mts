// Build assets only. No network, credentials, release, or shared backend changes.
import { mkdir, copyFile, writeFile, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { readBrowserSource } from '../../../website/browser-source.mts';
import { addReportingNavigation } from '../../../website/prepare-safety-site.mts';
const target = resolve(import.meta.dirname, 'public/legacy-safety');
await mkdir(target, { recursive: true });
const source = resolve(import.meta.dirname, '../../../website');
// Always regenerate the fail-closed preview. Release packaging replaces this only
// with its separately captured and verified live safety configuration.
const safetyConfig = resolve(import.meta.dirname, 'public/safety-removal');
await mkdir(safetyConfig, { recursive: true });
await writeFile(
  resolve(safetyConfig, 'config.js'),
  `window.DOJI_SAFETY_CONFIG = Object.freeze(${JSON.stringify({
    enabled: false,
    preview: true,
    endpoint: '',
    siteKey: '',
  })});\n`,
);
const content = resolve(import.meta.dirname, 'generated');
await mkdir(content, { recursive: true });
for (const slug of [
  'privacy',
  'terms',
  'community-guidelines',
  'child-safety',
  'support',
  'delete-account',
  'delete-data',
]) {
  const html = await readFile(resolve(source, slug, 'index.html'), 'utf8');
  await writeFile(
    resolve(content, `${slug}.html`),
    addReportingNavigation(html, `${slug}/index.html`),
  );
}
for (const [from, to] of [
  ['styles.css', 'styles.css'],
  ['portal.css', 'portal.css'],
  ['safety-removal/safety.css', 'safety.css'],
])
  await copyFile(resolve(source, from!), resolve(target, to!));
for (const [from, to] of [
  ['portal-select.js', 'portal-select.js'],
  ['safety-removal/taxonomy.js', 'taxonomy.js'],
  ['safety-removal/form.js', 'form.js'],
])
  await writeFile(resolve(target, to!), readBrowserSource(from!));
