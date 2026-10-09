import type { Page } from '@playwright/test';
import type { BrowserRealtimeSdk } from '../../../website/ably-browser.d.mts';

/** Non-realtime workflow tests must never fetch a provider SDK or open a real socket. */
export async function installOfflineRealtime(page: Page) {
  await page.addInitScript(() => {
    class OfflineRealtime {
      channels = { get: () => ({ subscribe: async () => {} }) };
      connection = { on: () => {} };
      connect() {}
      close() {}
    }
    window.Ably = { Realtime: OfflineRealtime } as unknown as BrowserRealtimeSdk;
  });
}
