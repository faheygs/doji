import { test as base, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

// Navigation can destroy an exposed-binding call fired from pagehide before it
// reaches Node. Explicit reload journeys flush while the old document is alive.
export async function captureBrowserCoverage(page) {
  if (process.env.DOJI_BROWSER_COVERAGE !== '1' || page.isClosed()) return;
  await page.evaluate(async () => {
    if (window.__dojiCoverageDocument && window.__dojiSaveCoverage) {
      await window.__dojiSaveCoverage(window.__dojiCoverageDocument, window.__coverage__ || {});
    }
  });
}

export async function reloadWithCoverage(page) {
  await captureBrowserCoverage(page);
  return page.reload();
}

// Opt-in only. Existing release test commands keep their normal behavior.
export const test = base.extend({
  coverage: [
    async ({ context }, use, testInfo) => {
      if (process.env.DOJI_BROWSER_COVERAGE !== '1') {
        await use();
        return;
      }
      const documents = new Map();
      await context.exposeBinding('__dojiSaveCoverage', (_source, id, data) => {
        // The same document can report on pagehide and final teardown. Replace its
        // snapshot instead of double-counting it; separate navigations keep theirs.
        documents.set(id, data);
      });
      await context.addInitScript(() => {
        window.__dojiCoverageDocument = crypto.randomUUID();
        window.addEventListener('pagehide', () => {
          void window.__dojiSaveCoverage(window.__dojiCoverageDocument, window.__coverage__ || {});
        });
      });
      await context.route('**/*', (route) => {
        const url = new URL(route.request().url());
        return ['127.0.0.1', 'localhost'].includes(url.hostname) ? route.continue() : route.abort();
      });
      await use(documents);
      for (const page of context.pages()) {
        if (page.isClosed()) continue;
        await captureBrowserCoverage(page);
      }
      const output = resolve(import.meta.dirname, '../test-results/coverage/current/browser');
      await mkdir(output, { recursive: true });
      let index = 0;
      for (const data of documents.values()) {
        await writeFile(
          resolve(output, `${testInfo.workerIndex}-${randomUUID()}-${index++}.json`),
          JSON.stringify(data),
        );
      }
    },
    { auto: true },
  ],
});
export { expect };
