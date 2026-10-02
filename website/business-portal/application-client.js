// Separate from the localStorage/sample workspace. Tokens live only in memory.
export function createBusinessApplicationClient(config, request = fetch) {
  if (config?.enabled !== true) throw Error('Business applications are not open yet.');
  const base = new URL(config.supabaseUrl);
  if (
    base.protocol !== 'https:' ||
    base.origin !== config.supabaseUrl ||
    !config.anonKey ||
    config.anonKey.startsWith('sb_secret_')
  )
    throw Error('Invalid public business configuration.');
  if (config.anonKey.split('.').length === 3) {
    try {
      if (
        JSON.parse(atob(config.anonKey.split('.')[1].replaceAll('-', '+').replaceAll('_', '/')))
          .role !== 'anon'
      )
        throw Error();
    } catch {
      throw Error('Only a public anonymous key is permitted in the browser.');
    }
  }
  let session = null,
    epoch = 0,
    refreshTask = null,
    recovery = false;
  const listeners = new Set();
  const identity = (value) =>
    value?.user?.role === 'doji_business' &&
    value.user.app_metadata?.account_type === 'business' &&
    value.user.email_confirmed_at &&
    typeof value.access_token === 'string' &&
    typeof value.refresh_token === 'string';
  const clear = () => {
    session = null;
    recovery = false;
    epoch++;
    refreshTask = null;
    listeners.forEach((fn) => fn());
  };
  async function call(path, body, token, method = 'POST') {
    const response = await request(`${base.origin}${path}`, {
      method,
      signal: AbortSignal.timeout(12000),
      cache: 'no-store',
      headers: {
        apikey: config.anonKey,
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const data = await response.json().catch(() => {
      // An unreadable successful RPC response is not an authoritative empty record.
      if (response.ok && path.startsWith('/rest/v1/rpc/'))
        throw Error('The server response could not be read. Please try again.');
      return null;
    });
    if (!response.ok) {
      const error = Error(data?.message || 'The request could not be completed.');
      error.status = response.status;
      error.code = data?.code;
      throw error;
    }
    return data;
  }
  async function auth(action, fields) {
    return call('/functions/v1/business-auth', { ...fields, action });
  }
  async function signin(fields) {
    clear();
    const stamp = epoch;
    const next = await auth('signin', fields);
    if (stamp !== epoch) throw Error('This sign-in is no longer active.');
    if (!identity(next)) throw Error('A verified, separate business account is required.');
    session = { ...next, expires_at: Math.floor(Date.now() / 1000) + Number(next.expires_in || 0) };
  }
  async function token() {
    if (!session) throw Error('Sign in with your separate business account.');
    if (session.expires_at > Date.now() / 1000 + 60) return session.access_token;
    if (!refreshTask) {
      const stamp = epoch,
        id = session.user.id;
      refreshTask = call('/auth/v1/token?grant_type=refresh_token', {
        refresh_token: session.refresh_token,
      })
        .then((next) => {
          if (stamp !== epoch) throw Error('This session has ended.');
          if (!identity(next) || next.user.id !== id) {
            clear();
            throw Error('Business identity could not be verified.');
          }
          session = {
            ...next,
            expires_at: Math.floor(Date.now() / 1000) + Number(next.expires_in || 0),
          };
          return session.access_token;
        })
        .catch((error) => {
          if (stamp === epoch) clear();
          throw error;
        })
        .finally(() => {
          if (stamp === epoch) refreshTask = null;
        });
    }
    return refreshTask;
  }
  async function rpc(name, body = {}) {
    const stamp = epoch;
    try {
      const bearer = await token();
      if (stamp !== epoch) throw Error('This session has ended.');
      const data = await call(`/rest/v1/rpc/${name}`, body, bearer);
      if (stamp !== epoch) throw Error('This session has ended.');
      return data;
    } catch (error) {
      if (stamp === epoch && (error.status === 401 || error.status === 403)) clear();
      throw error;
    }
  }
  async function protectedAuth(path, body, method = 'POST') {
    const stamp = epoch;
    const bearer = await token();
    if (stamp !== epoch) throw Error('This session has ended.');
    try {
      const data = await call(`/auth/v1/${path}`, body, bearer, method);
      if (stamp !== epoch) throw Error('This session has ended.');
      return data;
    } catch (error) {
      if (stamp === epoch && error.status === 401) clear();
      throw error;
    }
  }
  async function factors() {
    const user = await protectedAuth('user', undefined, 'GET');
    if (
      user?.id !== session?.user.id ||
      user.role !== 'doji_business' ||
      user.app_metadata?.account_type !== 'business'
    ) {
      clear();
      throw Error('Business identity could not be verified.');
    }
    return (user.factors || []).filter((f) => f.factor_type === 'totp');
  }
  function assurance() {
    try {
      return JSON.parse(
        atob(session.access_token.split('.')[1].replaceAll('-', '+').replaceAll('_', '/')),
      ).aal;
    } catch {
      return null;
    }
  }
  return {
    signin,
    auth,
    hasSession: () => Boolean(session),
    epoch: () => epoch,
    onClear(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    read: () => rpc('get_business_application_v1'),
    command: (body) => rpc('business_application_command_v1', body),
    workspace: () => rpc('get_business_workspace_v1'),
    async realtimeToken() {
      if (config.realtimeEnabled !== true) throw Error('Business realtime is not enabled.');
      const stamp = epoch;
      const bearer = await token();
      if (stamp !== epoch) throw Error('This session has ended.');
      try {
        const result = await call('/functions/v1/business-realtime-token', {}, bearer);
        if (stamp !== epoch) throw Error('This session has ended.');
        if (
          result?.topic !== `business:${session.user.id}:events` ||
          result?.tokenRequest?.clientId !== `business:${session.user.id}`
        )
          throw Error('Business realtime identity could not be verified.');
        return result;
      } catch (error) {
        if (stamp === epoch && [401, 403].includes(error.status)) clear();
        throw error;
      }
    },
    factors,
    assurance,
    async verifyLink(ticket) {
      clear();
      const stamp = epoch;
      const next = await auth('verify', { ticket });
      if (stamp !== epoch) throw Error('This verification is no longer active.');
      if (!identity(next) || !['signup', 'recovery'].includes(next.business_flow))
        throw Error('A verified, separate business account is required.');
      session = {
        ...next,
        expires_at: Math.floor(Date.now() / 1000) + Number(next.expires_in || 0),
      };
      recovery = next.business_flow === 'recovery';
      return next.business_flow;
    },
    async enroll() {
      const list = await factors();
      if (list.some((f) => f.status === 'verified'))
        throw Error('Use your existing authenticator.');
      // Clean only this business identity’s abandoned TOTP setup, never a verified factor.
      for (const factor of list.filter((f) => f.status === 'unverified'))
        await protectedAuth(`factors/${encodeURIComponent(factor.id)}`, undefined, 'DELETE');
      return protectedAuth('factors', {
        factor_type: 'totp',
        friendly_name: 'Doji Business',
        issuer: 'Doji Business',
      });
    },
    async verifyFactor(factorId, code) {
      if (!/^[0-9]{6}$/.test(code)) throw Error('Enter the six-digit authenticator code.');
      const id = session?.user.id;
      const path = `factors/${encodeURIComponent(factorId)}`;
      const challenge = await protectedAuth(`${path}/challenge`, {});
      const next = await protectedAuth(`${path}/verify`, { challenge_id: challenge.id, code });
      if (!identity(next) || next.user.id !== id) {
        clear();
        throw Error('Business identity could not be verified.');
      }
      session = {
        ...next,
        expires_at: Math.floor(Date.now() / 1000) + Number(next.expires_in || 0),
      };
      if (assurance() !== 'aal2') {
        clear();
        throw Error('Authenticator verification was not completed.');
      }
    },
    async resetPassword(password) {
      if (!recovery || password.length < 12 || password.length > 128)
        throw Error('Use a recovery link and a new password of 12–128 characters.');
      const list = await factors();
      if (list.some((f) => f.status === 'verified') && assurance() !== 'aal2')
        throw Error('Verify your existing authenticator before changing the password.');
      const user = await protectedAuth('user', { password }, 'PUT');
      if (user?.id !== session?.user.id || user.role !== 'doji_business') {
        clear();
        throw Error('Business identity could not be verified.');
      }
      recovery = false;
    },
    async signout() {
      const bearer = session?.access_token;
      clear();
      if (bearer) await call('/auth/v1/logout?scope=local', {}, bearer);
    },
    clear,
  };
}

// Bounded, event-driven state. No timers/polling and no automatic mutation retry.
export function createApplicationController(client, changed = () => {}) {
  let application = null,
    draft = {},
    dirty = false,
    stale = false,
    pending = false,
    loaded = false,
    loading = false,
    lastCheckedAt = null,
    readError = '',
    draftVersion = 0,
    intent = null,
    error = '',
    generation = 0;
  let activeRead = null,
    reconcilePending = false;
  const snapshot = () => ({
    application,
    draft: { ...draft },
    dirty,
    stale,
    pending,
    error,
    loaded,
    loading,
    lastCheckedAt,
    readError,
    draftVersion,
  });
  const notify = () => changed(snapshot());
  const unsubscribe = client.onClear(() => {
    generation++;
    activeRead = null;
    reconcilePending = false;
    application = null;
    draft = {};
    dirty = stale = pending = loaded = loading = false;
    lastCheckedAt = null;
    readError = '';
    draftVersion++;
    intent = null;
    error = '';
    notify();
  });
  async function load(discard = false) {
    if (activeRead) return activeRead;
    if (pending) return;
    const stamp = generation,
      sessionEpoch = client.epoch();
    loading = true;
    readError = '';
    activeRead = Promise.resolve()
      .then(() => {
        if (stamp !== generation || sessionEpoch !== client.epoch()) return;
        return client.read();
      })
      .then((next) => {
        if (stamp !== generation || sessionEpoch !== client.epoch()) return;
        loaded = true;
        lastCheckedAt = Date.now();
        if (dirty && !discard) {
          stale = next?.revision !== application?.revision;
        } else {
          application = next;
          draft = { ...(next?.details || {}) };
          draftVersion++;
          dirty = stale = false;
          intent = null;
          error = '';
        }
        notify();
      })
      .catch((failure) => {
        if (stamp === generation && sessionEpoch === client.epoch()) {
          readError = failure.message;
          notify();
        }
      })
      .finally(() => {
        if (stamp === generation) {
          activeRead = null;
          loading = false;
          notify();
          drainReconciliation();
        }
      });
    notify();
    return activeRead;
  }
  async function command(action, termsVersion, privacyVersion) {
    if (!loaded || pending || stale) return;
    const stamp = ++generation,
      sessionEpoch = client.epoch();
    activeRead = null; // An older read may not overwrite a newer command result.
    loading = false;
    const body = {
      p_action: action,
      p_revision: application?.revision ?? null,
      p_details: { ...draft },
      p_terms_version: termsVersion ?? null,
      p_privacy_version: privacyVersion ?? null,
    };
    const fingerprint = JSON.stringify(body);
    if (!intent || intent.fingerprint !== fingerprint)
      intent = { fingerprint, id: crypto.randomUUID() };
    pending = true;
    error = '';
    notify();
    try {
      const result = await client.command({ ...body, p_request_id: intent.id });
      if (stamp !== generation || sessionEpoch !== client.epoch()) return;
      application = result.application;
      draft = { ...(application?.details || {}) };
      draftVersion++;
      lastCheckedAt = Date.now();
      readError = '';
      dirty = stale = false;
      intent = null;
    } catch (failure) {
      if (stamp !== generation || sessionEpoch !== client.epoch()) return;
      error = failure.message;
      if (['PT409', '40001'].includes(failure.code)) stale = true;
      // Keep identical intent key on ambiguous failure; changed input gets new key.
    } finally {
      if (stamp === generation && sessionEpoch === client.epoch()) {
        pending = false;
        notify();
        drainReconciliation();
      }
    }
  }
  function drainReconciliation() {
    if (reconcilePending && !activeRead && !pending) {
      reconcilePending = false;
      void load();
    }
  }
  function reconcile() {
    if (activeRead || pending) {
      reconcilePending = true;
      return activeRead;
    }
    return load();
  }
  return {
    snapshot,
    load,
    reconcile,
    command,
    edit(key, value) {
      if (!loaded || pending) return;
      draft = { ...draft, [key]: value };
      dirty = true;
    },
    destroy() {
      generation++;
      reconcilePending = false;
      unsubscribe();
      application = null;
      draft = {};
      intent = null;
    },
  };
}
