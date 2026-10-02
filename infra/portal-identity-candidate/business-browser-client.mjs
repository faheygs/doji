// Staging candidate. No import from deployed portal. Compatible with the existing
// application controller; tokens/cookies are never read by JavaScript or persisted.
export function createBusinessBrowserClient(config, request = fetch) {
  const base = new URL(config?.origin);
  if (
    config?.enabled !== true ||
    base.protocol !== 'https:' ||
    base.origin !== config.origin ||
    config.realm !== 'business'
  )
    throw Error('Business identity is not enabled.');
  let session = null,
    generation = 0,
    restoreTask = null;
  const listeners = new Set();
  const clear = () => {
    generation++;
    session = null;
    restoreTask = null;
    for (const listener of listeners) listener();
  };
  async function call(path, data, csrf) {
    const response = await request(base.origin + path, {
      method: data === undefined ? 'GET' : 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(12000),
      headers: {
        ...(data === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(csrf ? { 'X-Doji-CSRF': csrf } : {}),
      },
      ...(data === undefined ? {} : { body: JSON.stringify(data) }),
    });
    let result;
    try {
      result = await response.json();
    } catch {
      throw Error('The server response could not be read. Please retry.');
    }
    if (!response.ok) {
      const error = Error(
        response.status === 409
          ? 'This record changed. Refresh before trying again.'
          : 'Business access could not be completed. Please retry or sign in again.',
      );
      error.status = response.status;
      if (response.status === 409) error.code = 'PT409';
      throw error;
    }
    if (result === null && path !== '/api/application')
      throw Error('The server response could not be read.');
    return result;
  }
  const restore = () => {
    if (restoreTask) return restoreTask;
    const stamp = generation;
    const task = call('/api/session')
      .then((value) => {
        if (stamp !== generation) throw Error('This session has ended.');
        if (
          value?.signedIn !== true ||
          !/^[A-Za-z0-9_-]{43}$/.test(value.csrf || '') ||
          !['aal1', 'aal2'].includes(value.assurance)
        )
          throw Error('Business identity could not be verified.');
        session = { csrf: value.csrf, assurance: value.assurance };
        return true;
      })
      .catch((error) => {
        if (stamp === generation) clear();
        if (error.status === 401) return false;
        throw error;
      })
      .finally(() => {
        if (stamp === generation) restoreTask = null;
      });
    restoreTask = task;
    return task;
  };
  async function protectedCall(path, body) {
    const stamp = generation;
    if (!session) throw Error('Sign in with your business account.');
    try {
      const value = await call(path, body, session.csrf);
      if (stamp !== generation) throw Error('This session has ended.');
      return value;
    } catch (error) {
      if (stamp === generation && [401, 403].includes(error.status)) clear();
      throw error;
    }
  }
  const validApplication = (value) =>
    value &&
    typeof value.id === 'string' &&
    Number.isSafeInteger(value.revision) &&
    value.revision > 0 &&
    ['draft', 'pending', 'changes_requested', 'approved', 'rejected', 'withdrawn'].includes(
      value.state,
    ) &&
    value.details &&
    typeof value.details === 'object' &&
    !Array.isArray(value.details);
  return {
    restore,
    clear,
    hasSession: () => session !== null,
    epoch: () => generation,
    assurance: () => session?.assurance || null,
    onClear(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    async signin(fields = { signup: false }) {
      const stamp = generation;
      if (session) throw Error('Sign out before starting another sign-in.');
      const result = await call('/auth/start', fields);
      if (stamp !== generation) throw Error('This sign-in is no longer active.');
      const destination = new URL(result?.authorizationUrl);
      if (
        destination.origin !== 'https://api.workos.com' ||
        destination.pathname !== '/user_management/authorize' ||
        destination.username ||
        destination.password ||
        destination.hash ||
        destination.searchParams.get('redirect_uri') !== base.origin + '/auth/callback'
      )
        throw Error('Business sign-in destination could not be verified.');
      return destination.href; // UI performs top-level navigation; never inject into HTML.
    },
    async read() {
      const value = await protectedCall('/api/application');
      if (value !== null && !validApplication(value))
        throw Error('The application response could not be verified. Please retry.');
      return value;
    },
    async command(body) {
      const value = await protectedCall('/api/application', body);
      if (!validApplication(value?.application))
        throw Error('The command response could not be verified. Refresh to check its status.');
      return value;
    },
    async signout() {
      const csrf = session?.csrf;
      clear(); // Fence protected data and in-flight work before waiting on network.
      if (!csrf) return;
      const result = await call('/auth/logout', {}, csrf);
      if (result?.signedIn !== false || result.remoteConfirmed !== true)
        throw Error('This page is locked. Remote sign-out could not be confirmed.');
    },
  };
}
