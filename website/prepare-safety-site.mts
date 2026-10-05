// Local review overlay, NOT a complete Pages deployment. No network or credentials.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import type { BinaryLike } from 'node:crypto';
import { readFile, writeFile, mkdir, mkdtemp } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readBrowserSource } from './browser-source.mts';

const source = resolve(import.meta.dirname);
export const publicPages = [
  'index.html',
  ...[
    'privacy',
    'terms',
    'community-guidelines',
    'child-safety',
    'support',
    'delete-account',
    'delete-data',
    'safety-removal',
  ].map((page) => `${page}/index.html`),
];
export const publicAssets = [
  'assets/doji-icon.png',
  'styles.css',
  'portal.css',
  'portal-select.js',
  'safety-removal/config.js',
  'safety-removal/form.js',
  'safety-removal/taxonomy.js',
  'safety-removal/safety.css',
];
const safetyLink = '<a href="/safety-removal/">Safety &amp; removal</a>';
const childLink = '<a href="/child-safety/">Child Safety</a>';
const hash = (bytes: BinaryLike) => createHash('sha256').update(bytes).digest('hex');

function replaceOnce(html: string, needle: string, replacement: string, page: string) {
  assert.equal(html.split(needle).length, 2, `${page}: expected one ${needle}`);
  return html.replace(needle, () => replacement);
}

export function addReportingNavigation(html: string, page: string) {
  // Navigation only on legal pages: do not revise policy bodies/effective dates.
  if (page !== 'safety-removal/index.html') {
    html = replaceOnce(html, '<body>', '<body class="safetyLinkedPage">', page);
  }
  const footer = html.match(/<div class="footerLinks">([\s\S]*?)<\/div>/)?.[0];
  assert.ok(footer, `${page}: missing footer`);
  assert.ok(
    !footer.includes('/safety-removal/'),
    `${page}: safety link already present; review generator`,
  );
  html = replaceOnce(
    html,
    footer,
    footer.replace(
      '</div>',
      `${safetyLink}${footer.includes('/child-safety/') ? '' : childLink}</div>`,
    ),
    page,
  );
  if (page === 'index.html' || page === 'support/index.html') {
    html = replaceOnce(html, '<a href="/community-guidelines/">Safety</a>', safetyLink, page);
  }
  if (page === 'index.html') {
    html = replaceOnce(
      html,
      '<div class="trustLinks">',
      `<div class="trustLinks">${safetyLink}${childLink}`,
      page,
    );
  }
  if (
    [
      'community-guidelines/index.html',
      'child-safety/index.html',
      'delete-data/index.html',
    ].includes(page)
  ) {
    html = replaceOnce(
      html,
      '<aside class="sideNav">',
      `<aside class="sideNav">${safetyLink}`,
      page,
    );
  }
  if (page === 'support/index.html') {
    const section = `<section class="supportCard"><h2>Report content or request removal</h2><p>Use the <a href="/safety-removal/">Safety and Removal Center</a> for content or account concerns, including intimate images shared without consent (TAKE IT DOWN), child safety, threats, harassment, impersonation and intellectual property. You do not need a Doji account. Choose the category that best fits your concern.</p><p>If someone is in immediate danger, contact local emergency services first. Do not send or forward suspected child sexual abuse material.</p></section>
<section class="supportCard"><h2>Appeal a moderation decision</h2><p>In the app, open Settings, then Account Status to review a decision and its appeal options. If you cannot access the app, <a href="mailto:support@dojipro.com?subject=Doji%20Moderation%20Appeal">contact support</a> with the decision reference, if available. Do not include private images or sign-in codes.</p></section>
`;
    html = replaceOnce(
      html,
      '<article class="legalArticle">',
      `<article class="legalArticle">${section}`,
      page,
    );
  }
  return html;
}

// Non-overlapping document rules: Pages combines duplicate matching CSP values,
// rather than treating the last rule as an override. No broad Turnstile allowance.
export function candidateHeaders() {
  const ordinary =
    "default-src 'self'; script-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-src 'none'; frame-ancestors 'none'";
  const safety = ordinary
    .replace("script-src 'self'", "script-src 'self' https://challenges.cloudflare.com")
    .replace(
      "connect-src 'self'",
      "connect-src 'self' https://tvixsmqxotuvyjqzmjla.supabase.co/functions/v1/safety-removal",
    )
    .replace("frame-src 'none'", 'frame-src https://challenges.cloudflare.com');
  const rules = publicPages
    .filter((p) => p !== 'safety-removal/index.html')
    .flatMap((page) =>
      page === 'index.html'
        ? ['/', '/index.html']
        : [`/${page.slice(0, -'/index.html'.length)}`, `/${page.slice(0, -'index.html'.length)}*`],
    );
  return `/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: no-referrer
  Permissions-Policy: camera=(), microphone=(), geolocation=()
  X-Frame-Options: DENY

${rules.map((path) => `${path}\n  Content-Security-Policy: ${ordinary}\n`).join('\n')}
/safety-removal
  Content-Security-Policy: ${safety}
  Cache-Control: no-store

/safety-removal/*
  Content-Security-Policy: ${safety}
  Cache-Control: no-store
`;
}

export async function prepareSafetySite(parent = resolve(source, '../test-results')) {
  await mkdir(parent, { recursive: true });
  // Always fresh: stale previews, credentials and test fixtures cannot carry over.
  const folder = await mkdtemp(join(parent, 'safety-site-candidate-'));
  const site = join(folder, 'site');
  const assets = [];
  for (const path of [...publicPages, ...publicAssets]) {
    const original = path.endsWith('.js')
      ? Buffer.from(readBrowserSource(path))
      : await readFile(join(source, path));
    const content = publicPages.includes(path)
      ? Buffer.from(addReportingNavigation(original.toString('utf8'), path))
      : original;
    if (path === 'safety-removal/config.js') {
      assert.match(content.toString(), /enabled: false/);
      assert.match(content.toString(), /endpoint: (?:''|"")/);
      assert.match(content.toString(), /siteKey: (?:''|"")/);
      assert.ok(!content.toString().includes('preview:'), 'Preview config cannot ship');
    }
    await mkdir(dirname(join(site, path)), { recursive: true });
    await writeFile(join(site, path), content, { flag: 'wx' });
    assets.push({ path, sourceSha256: hash(original), sha256: hash(content) });
  }
  const headers = candidateHeaders();
  await writeFile(join(site, '_headers'), headers, { flag: 'wx' });
  assets.push({ path: '_headers', sha256: hash(headers) });
  const manifest = {
    kind: 'public-safety-review-overlay',
    deploymentReady: false,
    acceptingRequests: false,
    generatedAt: new Date().toISOString(),
    assets,
    requiredBeforeDeployment: [
      'Compare source hashes to live public assets; review every changed file.',
      'Merge into a verified complete live-site snapshot, preserving business/admin routes and their headers byte-for-byte. This overlay is NOT a whole-site replacement.',
      'Reconcile shared styles against the live baseline; do not deploy unrelated portal changes.',
      'Qualify backend, operator alert delivery, content-removal paths, cost allowances and rollback; obtain separate deployment approval.',
      'Configure and verify production endpoint/Turnstile only in the approved artifact. Intake remains disabled in this candidate.',
    ],
  };
  await writeFile(join(folder, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, {
    flag: 'wx',
  });
  return { folder, site, manifest };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  assert.equal(process.argv.length, 2, 'No activation or deployment arguments are accepted');
  const { folder } = await prepareSafetySite();
  console.log(`Disabled local review overlay (NOT deploy-ready): ${folder}`);
}
