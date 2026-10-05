export type BrowserRealtimeSdk = Pick<typeof import('ably'), 'Realtime'>;
declare global {
  interface Window {
    Ably?: BrowserRealtimeSdk;
  }
}
