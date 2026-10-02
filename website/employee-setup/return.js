// Presentation routing only: do not store tokens, grant access or make auth calls.
(() => {
  try {
    const params = new URLSearchParams(location.hash.slice(1));
    const token = params.get('access_token');
    if (!token) return;
    const part = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const claims = JSON.parse(atob(part.padEnd(Math.ceil(part.length / 4) * 4, '=')));
    if (claims.role === 'doji_employee') {
      history.replaceState(null, '', location.pathname);
      location.replace('/employee-setup/#email-return');
    }
  } catch { /* Unrecognized auth returns never change the member/legacy portal. */ }
})();
