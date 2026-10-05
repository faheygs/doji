// Invitation completion is not authentication. Discard the unused short-lived
// authorization query without exchanging, storing or forwarding any value.
(() => {
  if (location.pathname.replace(/\/$/, '') !== '/identity/setup-complete') return;
  if (location.search || location.hash) history.replaceState(null, '', location.pathname);
})();
