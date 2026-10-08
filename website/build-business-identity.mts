// Local artifact assembly only. Never deploys or reads credentials.
import { spawnSync } from 'node:child_process';
import { readFile, writeFile, copyFile } from 'node:fs/promises';
import { resolve, relative, sep } from 'node:path';
import { build } from '../infra/doji-orchestrator/node_modules/esbuild/lib/main.js';
import { eligible, instrument } from '../scripts/coverage-instrument.mts';
import type { BusinessIdentityConfig } from './business-portal/identity/config.mts';
const root = resolve(import.meta.dirname, '..');
export async function buildBusinessIdentity(
  output: string,
  config: BusinessIdentityConfig,
  coverage = false,
) {
  output = resolve(output);
  const target = relative(root, output);
  if (
    (!target.startsWith(`test-results${sep}`) &&
      !target.startsWith(`website${sep}.business-identity`)) ||
    target.split(sep).includes('..')
  )
    throw Error('Dedicated local business artifact directory required');
  if (
    config.origin !== 'https://business.dojipro.com' ||
    !/^[A-Za-z0-9_-]+$/.test(config.turnstileSiteKey) ||
    config.termsVersion !== 'business-terms-20260930-v1' ||
    config.privacyVersion !== 'business-privacy-20260930-v1' ||
    config.termsUrl !== config.origin + '/business-terms/' ||
    config.privacyUrl !== config.origin + '/business-privacy/'
  )
    throw Error('Exact approved public business configuration required');
  const result = spawnSync(process.execPath, ['website/build-business.mts'], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, DOJI_BUSINESS_OUTPUT: output, DOJI_BUSINESS_ENABLED: 'false' },
  });
  if (result.status !== 0) throw Error('Base business artifact assembly failed');
  await copyFile(
    resolve(import.meta.dirname, 'business-portal/identity/home.html'),
    resolve(output, 'index.html'),
  );
  await copyFile(
    resolve(import.meta.dirname, 'business-portal/identity/home.css'),
    resolve(output, 'business-home.css'),
  );
  await writeFile(
    resolve(output, '_redirects'),
    '/business-portal/ /business-portal/application/ 302\n',
  );
  await writeFile(
    resolve(output, 'robots.txt'),
    'User-agent: *\nDisallow: /business-portal/\nDisallow: /auth/\nDisallow: /api/\n',
  );
  // Explicit projection: additional caller fields can never serialize secrets.
  const publicConfig: BusinessIdentityConfig = {
    enabled: config.enabled === true,
    origin: config.origin,
    turnstileSiteKey: config.turnstileSiteKey,
    termsUrl: config.termsUrl,
    privacyUrl: config.privacyUrl,
    termsVersion: config.termsVersion,
    privacyVersion: config.privacyVersion,
  };
  await writeFile(
    resolve(output, 'business-portal/config.js'),
    `window.DOJI_BUSINESS_IDENTITY_CONFIG = Object.freeze(${JSON.stringify(publicConfig)});\n`,
  );
  // Compose the existing account and application views into one document. The
  // access entry can hand off its verified client without reloading/rechecking.
  // Only maintained, local HTML is composed; no account data is embedded.
  const accountHtml = await readFile(
    resolve(import.meta.dirname, 'business-portal/identity/access.html'),
    'utf8',
  );
  const applicationHtml = await readFile(
    resolve(import.meta.dirname, 'business-portal/identity/application.html'),
    'utf8',
  );
  const accountMain = accountHtml.match(/<main\b[^>]*>[\s\S]*?<\/main>/g);
  if (accountMain?.length !== 1 || !applicationHtml.includes('id="businessMain"'))
    throw Error('Business shell template is incomplete');
  const accessHtml = applicationHtml
    .replace('<title>Your business · Doji</title>', '<title>Doji · Business account</title>')
    .replace(
      '</head>',
      '<link rel="stylesheet" href="/business-portal/access/access.css" /></head>',
    )
    .replace(
      '<main class="applicationMain journeyMain" id="businessMain">',
      accountMain[0]!.replace('<main ', '<main id="businessAccountAccess" ') +
        '<main class="applicationMain journeyMain" id="businessMain" hidden>',
    )
    .replace(
      'href="#businessMain">Skip to content',
      'href="#businessAccountAccess">Skip to content',
    )
    .replace(
      'src="/business-portal/application/application.js"',
      'src="/business-portal/access/access.js"',
    );
  await writeFile(resolve(output, 'business-portal/access/index.html'), accessHtml);
  await copyFile(
    resolve(import.meta.dirname, 'business-portal/identity/access.css'),
    resolve(output, 'business-portal/access/access.css'),
  );
  await copyFile(
    resolve(import.meta.dirname, 'business-portal/identity/application.html'),
    resolve(output, 'business-portal/application/index.html'),
  );
  await copyFile(
    resolve(import.meta.dirname, 'business-portal/identity/journey.css'),
    resolve(output, 'business-portal/application/journey.css'),
  );
  for (const page of ['access', 'application'])
    await build({
      entryPoints: [
        resolve(
          import.meta.dirname,
          `business-portal/identity/${page === 'application' ? 'application-entry' : page}.mts`,
        ),
      ],
      outfile: resolve(output, `business-portal/${page}/${page}.js`),
      bundle: true,
      format: 'esm',
      platform: 'browser',
      target: 'es2022',
      sourcemap: false,
      plugins: coverage
        ? [
            {
              name: 'maintained-source-coverage',
              setup(builder) {
                builder.onLoad({ filter: /\.mts$/ }, async ({ path }) => {
                  if (!eligible(path)) return;
                  return {
                    contents: instrument(await readFile(path, 'utf8'), path).code,
                    loader: 'js',
                  };
                });
              },
            },
          ]
        : [],
    });
  await build({
    entryPoints: [resolve(root, 'infra/portal-identity-candidate/business-pages-worker.mts')],
    outfile: resolve(output, '_worker.js'),
    bundle: true,
    format: 'esm',
    platform: 'neutral',
    target: 'es2022',
    external: ['node:crypto', 'node:buffer'],
  });
  await writeFile(
    resolve(output, '_routes.json'),
    JSON.stringify({ version: 1, include: ['/auth/*', '/api/*'], exclude: [] }) + '\n',
  );
  // A business-only CSP. No direct browser Supabase calls or provider tokens.
  await writeFile(
    resolve(output, '_headers'),
    `/*
  Cache-Control: no-store, no-transform
  X-Content-Type-Options: nosniff
  Referrer-Policy: no-referrer
  Permissions-Policy: camera=(), microphone=(), geolocation=()
  X-Frame-Options: DENY
  Content-Security-Policy: default-src 'self'; script-src 'self' https://challenges.cloudflare.com; connect-src 'self' https://challenges.cloudflare.com; frame-src https://challenges.cloudflare.com; img-src 'self' data:; style-src 'self' 'unsafe-inline'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'
`,
  );
}
