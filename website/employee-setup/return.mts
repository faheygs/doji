// Presentation routing only: do not store tokens, grant access or make auth calls.
(() => {
  try {
    const params = new URLSearchParams(location.hash.slice(1));
    const token = params.get('access_token');
    if (!token) return;
    const payload = token.split('.')[1];
    if (!payload) return;
    const part = payload.replace(/-/g, '+').replace(/_/g, '/');
    const claims: unknown = JSON.parse(atob(part.padEnd(Math.ceil(part.length / 4) * 4, '=')));
    if (
      claims &&
      typeof claims === 'object' &&
      'role' in claims &&
      claims.role === 'doji_employee'
    ) {
      history.replaceState(null, '', location.pathname);
      location.replace('/employee-setup/#email-return');
    }
  } catch {
    /* Unrecognized auth returns never change the member/legacy portal. */
  }
})();
