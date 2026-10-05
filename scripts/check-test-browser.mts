// Fail once, before thousands of tests, if the documented browser is missing.
import { chromium } from '@playwright/test';
let browser;
try {
  browser = await chromium.launch({
    channel: process.env.DOJI_TEST_BROWSER_CHANNEL || undefined,
    headless: true,
    args: ['--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1, EXCLUDE localhost'],
  });
  console.log(
    `PASS: local test browser available (${process.env.DOJI_TEST_BROWSER_CHANNEL || 'bundled chromium'})`,
  );
} catch {
  console.error(
    'Test browser unavailable. Install it with npx playwright install chromium, or set DOJI_TEST_BROWSER_CHANNEL=chrome to use an installed Chrome. No tests were skipped or counted as passing.',
  );
  process.exitCode = 1;
} finally {
  await browser?.close();
}
