import type { BrowserRealtimeSdk } from '../../../../../website/ably-browser.d.mts';

let loading: Promise<BrowserRealtimeSdk> | null = null;
/** Existing portal SDK destination; loaded only after the employee channel read succeeds. */
export function loadEmployeeRealtimeSdk(): Promise<BrowserRealtimeSdk> {
  if (window.Ably?.Realtime) return Promise.resolve(window.Ably);
  if (loading) return loading;
  loading = new Promise<BrowserRealtimeSdk>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.ably.com/lib/ably.min-2.js';
    script.async = true;
    script.crossOrigin = 'anonymous';
    script.onload = () =>
      window.Ably?.Realtime ? resolve(window.Ably) : reject(Error('Realtime client unavailable.'));
    script.onerror = () => reject(Error('Realtime client unavailable.'));
    document.head.appendChild(script);
  }).catch((error) => {
    loading = null;
    throw error;
  });
  return loading;
}
