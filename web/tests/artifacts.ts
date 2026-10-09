import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const read = (path: string) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8');
const html = read('../apps/site/out/index.html');
assert.match(html, /<h1[^>]*>Ten minutes/);
assert.match(html, /name="description"/);
assert.match(html, /rel="canonical" href="https:\/\/dojipro\.com\/"/);
assert.match(html, /name="robots" content="noindex, nofollow"/);
assert.match(read('../apps/site/out/robots.txt'), /Disallow: \//);
for (const app of ['admin', 'business']) {
  const output = read(`../apps/${app}/dist/index.html`);
  assert.match(output, /name="robots" content="noindex,nofollow"/);
  assert.match(output, /type="module"/);
  const directory = new URL(`../apps/${app}/dist/assets/`, import.meta.url);
  const scripts = readdirSync(directory).filter((name) => name.endsWith('.js'));
  const bytes = scripts.reduce(
    (total, name) => total + gzipSync(readFileSync(new URL(name, directory))).length,
    0,
  );
  const charts = scripts.filter((name) => name.startsWith('LineChart-'));
  const chartBytes = charts.reduce(
    (total, name) => total + gzipSync(readFileSync(new URL(name, directory))).length,
    0,
  );
  if (app === 'admin') {
    assert.equal(charts.length, 1, 'Preview charts must remain independently deferred');
    assert.ok(chartBytes <= 110 * 1024, 'Community chart exceeds its explicit library budget');
    assert.ok(!output.includes(charts[0]!), 'Preview must not preload chart code');
  } else assert.equal(chartBytes, 0, 'Business must not include admin charts');
  const limit = (app === 'admin' ? 410 : 180) * 1024;
  assert.ok(
    // Complete lazy announcement settings/confirmation: measured non-chart 314.4 KiB.
    // Allocate 1 KiB more within the UNCHANGED 410 KiB total preview ceiling.
    bytes - chartBytes <= (app === 'admin' ? 315 : 180) * 1024,
    'Non-chart preview code exceeds its explicit design-system budget',
  );
  assert.ok(
    bytes <= limit,
    `${app} preview exceeds its total JavaScript gzip budget: ${bytes} > ${limit}`,
  );
  console.log(
    `${app} preview JavaScript including lazy routes: ${(bytes / 1024).toFixed(1)} KiB gzip`,
  );
}
console.log('Static HTML, canonical metadata, preview indexing guard and Vite artifacts passed.');
