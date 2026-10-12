import { captureOwnedResetLink } from './owned-reset-link';

// Imported by the entry point, not deferred until the account route mounts.
export const browserResetLink = captureOwnedResetLink(
  window,
  window.DOJI_REACT_BUSINESS_CONFIG?.ownedAuthEnabled === true &&
    window.DOJI_REACT_BUSINESS_CONFIG?.maintenanceEnabled !== true,
);
