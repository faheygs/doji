export interface BusinessIdentityConfig {
  enabled: boolean;
  origin: string;
  turnstileSiteKey: string;
  termsUrl: string;
  privacyUrl: string;
  termsVersion: string;
  privacyVersion: string;
}
declare global {
  interface Window {
    DOJI_BUSINESS_IDENTITY_CONFIG?: BusinessIdentityConfig;
  }
}
export function identityConfig() {
  const c = window.DOJI_BUSINESS_IDENTITY_CONFIG;
  if (
    !c ||
    c.enabled !== true ||
    c.origin !== 'https://business.dojipro.com' ||
    !/^[A-Za-z0-9_-]+$/.test(c.turnstileSiteKey) ||
    c.termsVersion !== 'business-terms-20260930-v1' ||
    c.privacyVersion !== 'business-privacy-20260930-v1'
  )
    throw Error('Business account access is not available yet.');
  for (const url of [c.termsUrl, c.privacyUrl]) {
    const u = new URL(url);
    if (u.origin !== c.origin || u.username || u.password || u.search || u.hash)
      throw Error('Business legal information could not be verified.');
  }
  return Object.freeze({ ...c });
}
export function control<T extends HTMLElement = HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw Error('Missing business control: ' + id);
  return node as T;
}
