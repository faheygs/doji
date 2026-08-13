import { access, readFile, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

const root = resolve(import.meta.dirname);
const pages = [
  'index.html',
  'privacy/index.html',
  'terms/index.html',
  'community-guidelines/index.html',
  'support/index.html',
  'delete-account/index.html',
];

let failures = 0;
function fail(message) {
  failures += 1;
  console.error(`FAIL: ${message}`);
}

for (const page of pages) {
  const fullPath = join(root, page);
  const html = await readFile(fullPath, 'utf8');
  if (!html.includes('<title>')) fail(`${page} is missing a title`);
  if (!html.includes('name="description"')) fail(`${page} is missing a description`);
  if (!html.includes('href="/styles.css"')) fail(`${page} is missing shared styles`);
  if (!html.includes('/privacy/') || !html.includes('/terms/') || !html.includes('/support/')) {
    fail(`${page} is missing required legal/support navigation`);
  }
  if (html.includes('faheygs@gmail.com')) fail(`${page} exposes a personal support address`);

  for (const match of html.matchAll(/(?:href|src)="(\/[^"]+)"/g)) {
    const target = match[1].split(/[?#]/)[0];
    if (target === '/' || target.startsWith('/#') || target.startsWith('/mailto:')) continue;
    const candidate = target.endsWith('/')
      ? join(root, target.slice(1), 'index.html')
      : join(root, target.slice(1));
    try {
      await access(candidate);
    } catch {
      fail(`${page} references missing local asset/page ${target}`);
    }
  }
}

const icon = await stat(join(root, 'assets/doji-icon.png'));
if (icon.size < 1000) fail('Doji icon asset is unexpectedly small');

if (failures > 0) process.exit(1);
console.log(`Validated ${pages.length} pages and their local links.`);
