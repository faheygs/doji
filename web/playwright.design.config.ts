import { defineConfig } from '@playwright/test';
import base from './playwright.config';

// Focused admin acceptance can reuse the owner's local preview without stopping it.
export default defineConfig({
  ...base,
  outputDir: './test-results/design-reference',
  webServer: [
    { command: 'npm run dev:admin', url: 'http://127.0.0.1:4310', reuseExistingServer: true },
    { command: 'npm run dev:business', url: 'http://127.0.0.1:4311', reuseExistingServer: true },
  ],
});
