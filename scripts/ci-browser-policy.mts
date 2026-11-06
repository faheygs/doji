// CI images supply OS libraries and browser binaries, never application packages.
import assert from 'node:assert/strict';

export type BrowserJob = 'web-migration' | 'coverage';

export function browserJob(workflow: string, job: BrowserJob): string {
  const block = workflow.match(
    new RegExp(`^  ${job}:\\r?\\n([\\s\\S]*?)(?=^  [\\w-]+:|$(?![\\s\\S]))`, 'm'),
  )?.[1];
  assert.ok(block, `Missing required ${job} job`);
  return block;
}

export function validateBrowserImage(workflow: string, job: BrowserJob, version: string): void {
  const block = browserJob(workflow, job);
  const image = block.match(/^      image: (\S+)$/m)?.[1];
  assert.ok(image, `${job}: missing pinned browser image`);
  assert.match(image, /^mcr\.microsoft\.com\/playwright:v\d+\.\d+\.\d+-noble@sha256:[a-f0-9]{64}$/);
  assert.ok(
    image.startsWith(`mcr.microsoft.com/playwright:v${version}-noble@`),
    `${job}: image must match locked Playwright ${version}; update and qualify its digest together`,
  );
  assert.doesNotMatch(
    block,
    /playwright.*install|apt-get|continue-on-error/,
    `${job}: do not reintroduce OS downloads or hide failures`,
  );
  assert.match(block, /PLAYWRIGHT_BROWSERS_PATH: \/ms-playwright/);
}

type BrowserManifest = { browsers: { name: string; revision: string; browserVersion?: string }[] };
export function validateBrowserCompatibility(
  primary: BrowserManifest,
  secondary: BrowserManifest,
): void {
  for (const name of ['chromium', 'chromium-headless-shell', 'ffmpeg']) {
    const expected = primary.browsers.find((browser) => browser.name === name);
    const actual = secondary.browsers.find((browser) => browser.name === name);
    assert.ok(expected && actual, `Missing ${name} browser manifest`);
    assert.deepEqual(
      actual,
      expected,
      `${name}: root/web browser revisions differ; qualify compatible CI images before updating`,
    );
  }
}
