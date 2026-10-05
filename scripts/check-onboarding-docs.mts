// Read-only handbook checks. Does not contact providers or inspect secret files.
import { readFile, readdir, stat } from 'node:fs/promises';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const handbook = [
  'README.md',
  'docs/README.md',
  'docs/DEVELOPER_ONBOARDING.md',
  'docs/SYSTEM_MAP.md',
  'docs/SERVICE_CATALOG.md',
  'docs/LOCAL_DEVELOPMENT.md',
  'docs/TESTING_AND_RELEASES.md',
  'docs/SECURITY_AND_ACCESS.md',
  'docs/CURRENT_STATE_AND_GAPS.md',
];
const errors: string[] = [];
let links = 0;
const contents = new Map<string, string>();
async function read(path: string): Promise<string> {
  const cached = contents.get(path);
  if (cached !== undefined) return cached;
  const text = await readFile(path, 'utf8');
  contents.set(path, text);
  return text;
}
function anchors(markdown: string) {
  const found = new Set<string>();
  const occurrences = new Map<string, number>();
  // The handbook uses simple ATX headings. Fenced code is not a heading source.
  const text = markdown.replace(/^```[^\n]*\n[\s\S]*?^```\s*$/gm, '');
  for (const match of text.matchAll(/^#{1,6}\s+(.+?)\s*#*$/gm)) {
    const heading = match[1];
    if (!heading) continue;
    const base = heading
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s_-]/gu, '')
      .replace(/\s/g, '-');
    const count = occurrences.get(base) || 0;
    occurrences.set(base, count + 1);
    found.add(count ? `${base}-${count}` : base);
  }
  for (const match of markdown.matchAll(/\bid=["']([^"']+)["']/g))
    if (match[1]) found.add(match[1]);
  return found;
}
for (const file of handbook) {
  const path = resolve(root, file);
  const markdown = await read(path);
  if (!/^# .+/m.test(markdown)) errors.push(`${file}: missing title`);
  for (const match of markdown.matchAll(/\[[^\]\n]*\]\(([^)\s]+)\)/g)) {
    const href = match[1];
    if (!href) continue;
    if (/^[a-z][a-z0-9+.-]*:/i.test(href)) continue;
    links++;
    const [target, fragment] = href.split('#');
    const absolute = resolve(dirname(path), decodeURIComponent(target || ''));
    const resolved = target ? absolute : path;
    if (resolved !== root && !resolved.startsWith(root + sep)) {
      errors.push(`${file}: link escapes repository: ${href}`);
      continue;
    }
    try {
      const info = await stat(resolved);
      if (
        fragment &&
        info.isFile() &&
        resolved.endsWith('.md') &&
        !anchors(await read(resolved)).has(decodeURIComponent(fragment))
      ) {
        errors.push(`${file}: missing anchor: ${href}`);
      }
    } catch {
      errors.push(`${file}: missing target: ${href}`);
    }
  }
}

async function markdownFiles(directory: string): Promise<string[]> {
  const result: string[] = [];
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, item.name);
    if (item.isDirectory()) result.push(...(await markdownFiles(path)));
    else if (item.name.endsWith('.md')) result.push(path);
  }
  return result;
}
const docsRoot = resolve(root, 'docs');
const index = await read(resolve(docsRoot, 'README.md'));
const documents = await markdownFiles(docsRoot);
for (const path of documents) {
  const local = relative(docsRoot, path).split(sep).join('/');
  if (local !== 'README.md' && !index.includes(`](${local})`))
    errors.push(`docs/README.md: unindexed ${local}`);
}

const expected = new Map([
  ['EXPO_PUBLIC_SUPABASE_URL', 'http://127.0.0.1:54321'],
  ['EXPO_PUBLIC_SUPABASE_ANON_KEY', 'REPLACE_WITH_LOCAL_PUBLIC_ANON_KEY'],
  ['EXPO_PUBLIC_APP_ENV', 'development'],
  ['EXPO_PUBLIC_COMMAND_GATEWAY_URL', ''],
  ['EXPO_PUBLIC_SCALE_READ_URL', ''],
  ['EXPO_PUBLIC_MEDIA_TRANSFORMS_ENABLED', 'false'],
  ['EXPO_PUBLIC_SENTRY_DSN', ''],
  ['EXPO_PUBLIC_RELEASE_CHANNEL', 'development'],
]);
const seen = new Set();
for (const line of (await read(resolve(root, '.env.example'))).split(/\r?\n/)) {
  if (!line.trim() || line.trim().startsWith('#')) continue;
  const at = line.indexOf('=');
  const key = line.slice(0, at);
  const value = line.slice(at + 1);
  if (at < 1 || !expected.has(key) || expected.get(key) !== value || seen.has(key)) {
    errors.push('.env.example: unexpected, duplicated or non-placeholder configuration');
  }
  seen.add(key);
}
for (const key of expected.keys()) if (!seen.has(key)) errors.push(`.env.example: missing ${key}`);

if (errors.length) {
  for (const error of errors) console.error(`FAIL ${error}`);
  process.exitCode = 1;
} else {
  console.log(
    `PASS: ${handbook.length} handbook files; ${links} local links/anchors; ${documents.length - 1} indexed documents; public-only environment template.`,
  );
  console.log(
    'No network, deployments or secret-file reads. Live status and historical claims require separate verification.',
  );
}
