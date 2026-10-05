// Isolated business artifact only. Never deploys, reads private env files or
// packages the sample/localStorage workspace, admin portal or member app.
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { buildBusinessLegal } from './build-business-legal.mts';
import { readBrowserSource } from './browser-source.mts';
const root = import.meta.dirname;
const output = process.env.DOJI_BUSINESS_OUTPUT
  ? resolve(process.env.DOJI_BUSINESS_OUTPUT)
  : resolve(root, '.business-dist');
const enabled = process.env.DOJI_BUSINESS_ENABLED === 'true';
const config: {
  enabled: boolean;
  publicAdmission: boolean;
  realtimeEnabled: false;
  supabaseUrl?: string;
} = { enabled: false, publicAdmission: false, realtimeEnabled: false };
function publicRole(key: string): unknown {
  const payload: unknown = JSON.parse(
    Buffer.from(key.split('.')[1] || '', 'base64url').toString('utf8'),
  );
  return payload && typeof payload === 'object' && 'role' in payload ? payload.role : undefined;
}
if (enabled) {
  const supabaseUrl = process.env.DOJI_BUSINESS_SUPABASE_URL;
  const anonKey = process.env.DOJI_BUSINESS_ANON_KEY;
  const turnstileSiteKey = process.env.DOJI_BUSINESS_TURNSTILE_SITE_KEY;
  const termsUrl = process.env.DOJI_BUSINESS_TERMS_URL;
  const privacyUrl = process.env.DOJI_BUSINESS_PRIVACY_URL;
  const termsVersion = process.env.DOJI_BUSINESS_TERMS_VERSION;
  const privacyVersion = process.env.DOJI_BUSINESS_PRIVACY_VERSION;
  if (
    !supabaseUrl ||
    new URL(supabaseUrl).protocol !== 'https:' ||
    new URL(supabaseUrl).origin !== supabaseUrl
  )
    throw Error('Exact HTTPS Supabase origin required.');
  if (!anonKey || (!anonKey.startsWith('sb_publishable_') && publicRole(anonKey) !== 'anon'))
    throw Error('Public anonymous key required; never a service key.');
  for (const url of [termsUrl, privacyUrl])
    if (!url || new URL(url).protocol !== 'https:')
      throw Error('Approved HTTPS legal URLs required.');
  if (
    !/^[A-Za-z0-9._-]{1,100}$/.test(termsVersion || '') ||
    !/^[A-Za-z0-9._-]{1,100}$/.test(privacyVersion || '') ||
    !turnstileSiteKey ||
    /[^a-zA-Z0-9_-]/.test(turnstileSiteKey)
  )
    throw Error('Approved legal versions and business Turnstile site key required.');
  Object.assign(config, {
    enabled: true,
    publicAdmission: true,
    supabaseUrl,
    anonKey,
    turnstileSiteKey,
    termsUrl,
    privacyUrl,
    termsVersion,
    privacyVersion,
  });
}
await mkdir(output, { recursive: true });
await buildBusinessLegal(output);
for (const file of ['styles.css', 'portal.css', 'portal.js', 'portal-select.js', 'theme-init.js']) {
  if (file.endsWith('.js')) await writeFile(join(output, file), readBrowserSource(file));
  else await cp(join(root, file), join(output, file));
}
await mkdir(join(output, 'assets'), { recursive: true });
await cp(join(root, 'assets/doji-icon.png'), join(output, 'assets/doji-icon.png'));
await mkdir(join(output, 'business-portal'), { recursive: true });
for (const file of [
  'application-client.js',
  'application-form.js',
  'business-mfa.js',
  'business-realtime.js',
  'business-verification.js',
])
  await writeFile(
    join(output, 'business-portal', file),
    readBrowserSource(`business-portal/${file}`),
  );
for (const dir of ['access', 'application']) {
  await cp(join(root, 'business-portal', dir), join(output, 'business-portal', dir), {
    recursive: true,
    filter: (path) => !path.endsWith('.mts'),
  });
  await writeFile(
    join(output, 'business-portal', dir, `${dir}.js`),
    readBrowserSource(`business-portal/${dir}/${dir}.js`),
  );
  const path = join(output, 'business-portal', dir, 'index.html');
  const html = (await readFile(path, 'utf8'))
    .replace('href="/business/"', 'href="https://dojipro.com/business/"')
    .replace(
      '<script src="/portal-select.js">',
      '<script src="/business-portal/config.js"></script>\n    <script src="/portal-select.js">',
    );
  await writeFile(path, html);
}
await writeFile(
  join(output, 'business-portal/config.js'),
  `window.DOJI_BUSINESS_APPLICATION_CONFIG = Object.freeze(${JSON.stringify(config)});\n`,
);
// One CSP on this separate artifact. Do not widen the shared public/admin CSP
// or combine conflicting policies (Pages concatenates duplicate headers).
const backend = enabled ? ` ${config.supabaseUrl}` : '';
await writeFile(
  join(output, '_headers'),
  `/*
  Cache-Control: no-store, no-transform
  X-Content-Type-Options: nosniff
  Referrer-Policy: no-referrer
  Permissions-Policy: camera=(), microphone=(), geolocation=()
  X-Frame-Options: DENY
  Content-Security-Policy: default-src 'self'; script-src 'self' https://challenges.cloudflare.com; connect-src 'self'${backend} https://challenges.cloudflare.com; frame-src https://challenges.cloudflare.com; img-src 'self' data:; style-src 'self' 'unsafe-inline'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'
`,
);
await writeFile(
  join(output, '_redirects'),
  '/ /business-portal/application/ 302\n/business-portal/ /business-portal/application/ 302\n',
);
await writeFile(join(output, 'robots.txt'), 'User-agent: *\nDisallow: /\n');
console.log(
  `Built isolated business artifact (${enabled ? 'configured public candidate' : 'disabled'}). Nothing deployed.`,
);
