// Static holding page only. Never invokes cloud APIs or includes account code.
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, cp, readFile, writeFile } from 'node:fs/promises';
import { inventory } from './prepare-safety-launch.mjs';
await mkdir('test-results', { recursive: true });
const folder = await mkdtemp('test-results/business-closed-');
const output = `${folder}/public`;
await mkdir(`${output}/assets`, { recursive: true });
const files = {
  'index.html': 'website/business-portal/closed/index.html',
  '404.html': 'website/business-portal/closed/index.html',
  'styles.css': 'website/styles.css',
  'portal.css': 'website/portal.css',
  'portal.js': 'website/portal.js',
  'portal-select.js': 'website/portal-select.js',
  'theme-init.js': 'website/theme-init.js',
  'application.css': 'website/business-portal/application/application.css',
  'assets/doji-icon.png': 'website/assets/doji-icon.png',
};
for (const [dest, source] of Object.entries(files)) await cp(source, `${output}/${dest}`);
const html = await readFile(`${output}/index.html`, 'utf8');
assert.ok(!/<form\b|<input\b|<iframe\b/i.test(html));
assert.ok(!/business-auth|supabase|turnstile|application-client|config.js/.test(html));
await writeFile(`${output}/_headers`, `/*
  Cache-Control: no-store
  X-Robots-Tag: noindex, nofollow
  X-Content-Type-Options: nosniff
  Referrer-Policy: no-referrer
  Permissions-Policy: camera=(), microphone=(), geolocation=()
  X-Frame-Options: DENY
  Content-Security-Policy: default-src 'none'; script-src 'self'; connect-src 'none'; frame-src 'none'; img-src 'self' data:; style-src 'self'; font-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'
`);
await writeFile(`${output}/_redirects`, '/business-portal / 302\n/business-portal/* / 302\n');
await writeFile(`${output}/robots.txt`, 'User-agent: *\nDisallow: /\n');
const assets = await inventory(output);
assert.equal(assets.length, 12);
await writeFile(`${folder}/candidate.json`, JSON.stringify({
  project: 'doji-business', origin: 'https://business.dojipro.com',
  mode: 'closed-static-only', assets, createdAt: new Date().toISOString(),
}, null, 2), { flag: 'wx' });
console.log(JSON.stringify({ folder, output, assets: assets.length, mode: 'closed-static-only' }));
