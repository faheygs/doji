import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const websiteRoot = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = dirname(websiteRoot);
const outputRoot = resolve(websiteRoot, '.admin-dist');

if (!outputRoot.startsWith(`${resolve(websiteRoot)}\\`)) {
  throw new Error('Admin build output escaped the website directory.');
}

function parseEnv(source) {
  return Object.fromEntries(source
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#') && line.includes('='))
    .map((line) => {
      const separator = line.indexOf('=');
      const key = line.slice(0, separator).trim();
      const value = line.slice(separator + 1).trim().replace(/^['"]|['"]$/g, '');
      return [key, value];
    }));
}

const localEnv = parseEnv(await readFile(join(repositoryRoot, '.env.local'), 'utf8'));
const supabaseUrl = process.env.DOJI_ADMIN_SUPABASE_URL || localEnv.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.DOJI_ADMIN_SUPABASE_ANON_KEY || localEnv.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const apiBaseUrl = process.env.DOJI_ADMIN_API_BASE_URL
  || 'https://doji-orchestrator.faheygs.workers.dev';

if (!supabaseUrl || !supabaseAnonKey || !apiBaseUrl) {
  throw new Error('Admin deployment requires the public Supabase URL, anon key, and API base URL.');
}

await rm(outputRoot, { recursive: true, force: true });
await mkdir(outputRoot, { recursive: true });
await cp(join(websiteRoot, 'assets'), join(outputRoot, 'assets'), { recursive: true });
await mkdir(join(outputRoot, 'admin-portal'), { recursive: true });
for (const file of ['index.html', 'admin.css', 'live-client.js']) {
  await cp(join(websiteRoot, 'admin-portal', file), join(outputRoot, 'admin-portal', file));
}

for (const file of ['styles.css', 'portal.css', 'portal.js', 'theme-init.js', '_headers']) {
  await cp(join(websiteRoot, file), join(outputRoot, file));
}
await cp(
  join(websiteRoot, 'portal.js'),
  join(outputRoot, 'admin-portal', 'portal-runtime-20260924o.js'),
);
await cp(join(websiteRoot, 'admin-portal', 'index.html'), join(outputRoot, 'index.html'));
await writeFile(join(outputRoot, 'robots.txt'), 'User-agent: *\nDisallow: /\n', 'utf8');
await writeFile(
  join(outputRoot, 'portal-config.js'),
  `window.DOJI_PORTAL_CONFIG = Object.freeze(${JSON.stringify({
    mode: 'live',
    supabaseUrl,
    supabaseAnonKey,
    apiBaseUrl,
  }, null, 2)});\n`,
  'utf8',
);

console.log(`Built isolated admin portal at ${outputRoot}`);
