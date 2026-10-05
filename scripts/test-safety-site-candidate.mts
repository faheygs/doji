// Local browser/packaging checks only. Every non-local request is mocked or blocked.
import assert from 'node:assert/strict';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { resolve, join, extname } from 'node:path';
import { createHash } from 'node:crypto';
import { chromium } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { prepareSafetySite, publicPages, publicAssets } from '../website/prepare-safety-site.mts';
import {evidenceRecord,evidenceAssets,evidenceText} from './release-evidence.mts';

const releaseMode=process.argv.includes('--release-artifact');
const candidate=releaseMode?evidenceRecord(JSON.parse(await readFile('test-results/safety-launch-20260929/public-candidate.json','utf8'))):null;
const { folder, site, manifest } = releaseMode?{
 folder:resolve('test-results/safety-launch-20260929'),site:resolve('test-results/safety-launch-20260929/public'),
 manifest:{...candidate,deploymentReady:candidate?.deploymentReady,acceptingRequests:candidate?.enabled,assets:evidenceAssets(candidate?.assets)},
}:await prepareSafetySite();
const source = resolve(import.meta.dirname, '../website');
assert.equal(manifest.deploymentReady, false);
assert.equal(manifest.acceptingRequests, false);
async function inventory(dir:string, prefix = ''):Promise<string[]> {
  const files:string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    files.push(...(entry.isDirectory() ? await inventory(join(dir, entry.name), `${prefix}${entry.name}/`) : [`${prefix}${entry.name}`]));
  }
  return files.sort();
}
assert.deepEqual(await inventory(site), releaseMode?manifest.assets.map(v=>v.path).sort():[...publicPages, ...publicAssets, '_headers'].sort());
for (const entry of manifest.assets) {
  assert.equal(createHash('sha256').update(await readFile(join(site, entry.path))).digest('hex'), entry.sha256);
}
for (const page of publicPages) {
  const html = await readFile(join(site, page), 'utf8');
  assert.ok(evidenceText(html.match(/<div class="footerLinks">([\s\S]*?)<\/div>/)?.[0]).includes('/safety-removal/'), page);
  assert.ok(!html.includes('Design preview'), page);
  for (const match of html.matchAll(/(?:href|src)="(\/[^"?#]*)[^\"]*"/g)) {
    const path = evidenceText(match[1]);
    // Existing business destinations are deliberately preserved, not bundled.
    if (path === '/business/' || path === '/business-portal/') continue;
    await readFile(join(site, path === '/' ? 'index.html' : path.endsWith('/') ? `${path.slice(1)}index.html` : path.slice(1)));
  }
  if (['privacy/index.html', 'terms/index.html', 'community-guidelines/index.html', 'child-safety/index.html', 'delete-data/index.html'].includes(page)) {
    const original = await readFile(join(source, page), 'utf8');
    assert.equal(evidenceText(html.match(/<article[\s\S]*?<\/article>/)?.[0]), evidenceText(original.match(/<article[\s\S]*?<\/article>/)?.[0]), `${page}: policy body changed`);
  }
}

// This candidate intentionally uses only exact paths and terminal splats. Keep the
// local header harness small; actual Pages headers still require live readback.
const rules = (await readFile(join(site, '_headers'), 'utf8')).trim().split(/\n\s*\n/).map(block => {
  const [path, ...lines] = block.split('\n');assert.ok(path);
  return { path, headers: Object.fromEntries(lines.map(line => { const at = line.indexOf(':'); return [line.slice(0, at).trim().toLowerCase(), line.slice(at + 1).trim()]; })) };
});
function headersFor(path:string) {
  const headers:Record<string,string> = {};
  for (const rule of rules) {
    if (rule.path.endsWith('*') ? path.startsWith(rule.path.slice(0, -1)) : path === rule.path) {
      for (const [key, value] of Object.entries(rule.headers)) {
        assert.ok(!(key in headers), `${path}: duplicate ${key} would be combined by Pages`);
        headers[key] = value;
      }
    }
  }
  return headers;
}
for (const path of ['/', '/index.html', '/support', '/support/', '/support/index.html', '/privacy/']) {
  assert.ok(!evidenceText(headersFor(path)['content-security-policy']).includes('challenges.cloudflare.com'));
}
for (const path of ['/safety-removal', '/safety-removal/', '/safety-removal/index.html', '/safety-removal/config.js']) {
  assert.ok(evidenceText(headersFor(path)['content-security-policy']).includes('frame-src https://challenges.cloudflare.com'));
  assert.equal(headersFor(path)['cache-control'], 'no-store');
  assert.equal(headersFor(path)['referrer-policy'], 'no-referrer');
}
const mime:Record<string,string> = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png' };
const server = createServer(async (req, res) => {
  const path = new URL(req.url??'/', 'http://localhost').pathname;
  const file = path.endsWith('/') ? `${path.slice(1)}index.html` : path.slice(1);
  if (!manifest.assets.some(asset => asset.path === file)) return res.writeHead(404).end();
  res.writeHead(200, { ...headersFor(path), 'content-type': mime[extname(file)] || 'application/octet-stream' });
  res.end(await readFile(join(site, file)));
});
await new Promise<void>(done => {server.listen(0, '127.0.0.1', done);});
const address=server.address();assert.ok(address&&typeof address!=='string');const origin = `http://127.0.0.1:${address.port}`;
let browser;
try {
  browser = await chromium.launch({ channel: 'chrome' });
  const context = await browser.newContext();
  const page = await context.newPage();
  const unexpected:string[] = [], violations:string[] = [];
  page.on('console', message => { if (/Content Security Policy|Refused to/.test(message.text())) violations.push(message.text()); });
  await page.route('**/*', route => {
    if (route.request().url().startsWith(`${origin}/`)) return route.continue();
    unexpected.push(route.request().url());
    return route.abort();
  });
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(`${origin}/support/`);
    await page.getByRole('link', { name: 'Safety and Removal Center', exact: true }).click();
    assert.equal(page.url(), `${origin}/safety-removal/`);
    await page.locator('#availability').filter({ hasText: 'Online intake is unavailable.' }).waitFor();
    assert.equal(await page.locator('#submitRequest').isDisabled(), true);
    assert.equal(await page.locator('#checkStatus').isDisabled(), true);
    assert.equal(await page.locator('#requestName').isDisabled(), true);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.equal(await page.locator('script[src*="turnstile"]').count(), 0);
    assert.deepEqual((await new AxeBuilder({ page }).analyze()).violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => ({ html: n.html, summary: n.failureSummary })) })), []);
    await page.screenshot({ path: join(folder, `disabled-intake-${width}.png`), fullPage: true });
    await page.goto(`${origin}/support/`);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.deepEqual((await new AxeBuilder({ page }).analyze()).violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => ({ html: n.html, summary: n.failureSummary })) })), []);
    await page.screenshot({ path: join(folder, `support-${width}.png`), fullPage: true });
  }
  assert.deepEqual(unexpected, [], 'Disabled artifact must not call any external service');
  assert.deepEqual(violations, [], 'Candidate blocked its own resources');
  const proof = { checkedAt: new Date().toISOString(), fileCount: manifest.assets.length, sourcePoliciesUnchanged: true, disabledWithoutExternalRequests: true, widths: [390, 1440], accessibilityViolations: 0, liveDeploymentVerified: false };
  await writeFile(join(folder, 'verification.json'), `${JSON.stringify(proof, null, 2)}\n`);
  console.log(`PASS: exact file/hash manifest, navigation, unchanged policies, scoped CSP, disabled browser flow, mobile/desktop accessibility. Evidence: ${folder}`);
} finally {
  await browser?.close();
  await new Promise<void>((done,reject) => {server.close(error=>error?reject(error):done());});
}
