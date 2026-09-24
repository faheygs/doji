(() => {
  const storageKey = 'doji-admin-session-v1';
  const ablyScriptUrl = 'https://cdn.ably.com/lib/ably.min-2.js';
  let ablyLoadTask = null;

  function loadAbly() {
    if (window.Ably?.Realtime) return Promise.resolve(window.Ably);
    if (ablyLoadTask) return ablyLoadTask;
    ablyLoadTask = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = ablyScriptUrl;
      script.async = true;
      script.crossOrigin = 'anonymous';
      script.onload = () => window.Ably?.Realtime
        ? resolve(window.Ably)
        : reject(new Error('The realtime client did not initialize.'));
      script.onerror = () => reject(new Error('The realtime client could not be loaded.'));
      document.head.appendChild(script);
    }).catch((error) => {
      ablyLoadTask = null;
      throw error;
    });
    return ablyLoadTask;
  }

  function normalizedUrl(value) {
    return String(value || '').replace(/\/$/, '');
  }

  function normalizedTotpQrCode(value) {
    const qrCode = String(value || '');
    if (!qrCode) return '';
    return `data:image/svg+xml;utf-8,${qrCode}`;
  }

  function decodeJwtPayload(token) {
    try {
      const encoded = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      return JSON.parse(atob(encoded.padEnd(Math.ceil(encoded.length / 4) * 4, '=')));
    } catch {
      return {};
    }
  }

  async function responseJson(response, fallback) {
    const text = await response.text();
    let body;
    try { body = text ? JSON.parse(text) : null; } catch { body = null; }
    if (!response.ok) {
      const message = body?.msg || body?.message || body?.error_description || body?.error || fallback;
      throw new Error(message);
    }
    return body;
  }

  function create(config) {
    const supabaseUrl = normalizedUrl(config.supabaseUrl);
    const apiBaseUrl = normalizedUrl(config.apiBaseUrl);
    const anonKey = String(config.supabaseAnonKey || '');
    if (!supabaseUrl || !apiBaseUrl || !anonKey) {
      throw new Error('The live admin portal is missing its public deployment configuration.');
    }

    let session = null;
    let realtime = null;
    let pendingSession = null;
    let pendingFactor = null;
    let pendingChallengeId = null;
    let pendingEnrollment = null;
    try { session = JSON.parse(sessionStorage.getItem(storageKey) || 'null'); } catch { session = null; }

    function saveSession(value) {
      session = value ? {
        access_token: value.access_token,
        refresh_token: value.refresh_token,
        expires_at: value.expires_at || Math.floor(Date.now() / 1000) + Number(value.expires_in || 3600),
        user: value.user,
      } : null;
      if (session) sessionStorage.setItem(storageKey, JSON.stringify(session));
      else sessionStorage.removeItem(storageKey);
    }

    async function authRequest(path, body, accessToken, method = 'POST') {
      const response = await fetch(`${supabaseUrl}/auth/v1${path}`, {
        method,
        headers: {
          apikey: anonKey,
          authorization: `Bearer ${accessToken || anonKey}`,
          'content-type': 'application/json',
        },
        body: method === 'DELETE' ? undefined : JSON.stringify(body || {}),
      });
      return responseJson(response, 'Authentication failed.');
    }

    function clearPendingAuth() {
      pendingSession = null;
      pendingFactor = null;
      pendingChallengeId = null;
      pendingEnrollment = null;
    }

    function factorType(factor) {
      return factor?.factor_type || factor?.type || '';
    }

    async function verifyPendingChallenge(code) {
      if (!pendingSession?.access_token || !pendingFactor?.id) {
        throw new Error('Start the protected sign-in again.');
      }
      if (!/^\d{6}$/.test(String(code || '').trim())) {
        throw new Error('Enter the current six-digit verification code.');
      }
      if (!pendingChallengeId) {
        const challenge = await authRequest(
          `/factors/${encodeURIComponent(pendingFactor.id)}/challenge`,
          { factorId: pendingFactor.id },
          pendingSession.access_token,
        );
        pendingChallengeId = challenge.id;
      }
      const verified = await authRequest(
        `/factors/${encodeURIComponent(pendingFactor.id)}/verify`,
        { challenge_id: pendingChallengeId, code: String(code).trim() },
        pendingSession.access_token,
      );
      if (decodeJwtPayload(verified.access_token || '').aal !== 'aal2') {
        throw new Error('The administrator verification did not reach assurance level two.');
      }
      saveSession(verified);
      clearPendingAuth();
      return verified;
    }

    async function refresh() {
      if (!session?.refresh_token) throw new Error('Your admin session has expired. Sign in again.');
      const refreshed = await authRequest('/token?grant_type=refresh_token', {
        refresh_token: session.refresh_token,
      });
      saveSession(refreshed);
      return session.access_token;
    }

    async function accessToken() {
      if (!session?.access_token) throw new Error('Sign in to continue.');
      if (Number(session.expires_at || 0) <= Math.floor(Date.now() / 1000) + 60) {
        return refresh();
      }
      return session.access_token;
    }

    async function portalRequest(path, options = {}) {
      const method = options.method || 'GET';
      const requestBody = options.body;
      const request = (token) => fetch(`${apiBaseUrl}${path}`, {
        method,
        headers: {
          authorization: `Bearer ${token}`,
          'x-client-info': 'doji-admin-portal/1.0',
          ...(requestBody === undefined ? {} : { 'content-type': 'application/json' }),
        },
        body: requestBody === undefined ? undefined : JSON.stringify(requestBody),
      });
      let token = await accessToken();
      let response = await request(token);
      if (response.status === 401) {
        token = await refresh();
        response = await request(token);
      }
      return responseJson(response, 'The admin portal could not load production data.');
    }

    async function realtimeToken() {
      return portalRequest('/portal/admin/realtime-token');
    }

    async function signEvidence(bucket, objectPath) {
      if (!bucket || !objectPath) return null;
      const encodedPath = String(objectPath).split('/').map(encodeURIComponent).join('/');
      const request = async (token) => fetch(
        `${supabaseUrl}/storage/v1/object/sign/${encodeURIComponent(bucket)}/${encodedPath}`,
        {
          method: 'POST',
          headers: {
            apikey: anonKey,
            authorization: `Bearer ${token}`,
            'content-type': 'application/json',
            'x-client-info': 'doji-admin-portal/1.0',
          },
          body: JSON.stringify({ expiresIn: 300 }),
        },
      );
      let token = await accessToken();
      let response = await request(token);
      if (response.status === 401) {
        token = await refresh();
        response = await request(token);
      }
      const body = await responseJson(response, 'The report evidence could not be authorized.');
      const signedPath = body?.signedURL || body?.signedUrl;
      if (!signedPath) throw new Error('The report evidence URL was not returned.');
      return signedPath.startsWith('http') ? signedPath : `${supabaseUrl}${signedPath}`;
    }

    async function startRealtime(onInvalidate, onStateChange) {
      if (realtime) return;
      const Ably = await loadAbly();
      let createdClient = null;
      const client = new Ably.Realtime({
        autoConnect: false,
        echoMessages: false,
        realtimeRequestTimeout: 20_000,
        authCallback: (_params, callback) => {
          realtimeToken().then(
            (tokenRequest) => callback(null, tokenRequest),
            (error) => callback(error instanceof Error ? error.message : 'Realtime authentication failed', null),
          );
        },
      });
      createdClient = client;
      realtime = client;
      let connectedOnce = false;
      client.connection.on((change) => {
        if (realtime !== createdClient) return;
        onStateChange?.(change.current);
        if (change.current === 'connected') {
          if (connectedOnce) onInvalidate?.({ type: 'connection.recovered' });
          connectedOnce = true;
        }
      });
      client.connect();
      for (const channelName of ['moderation:global', 'doji:global']) {
        const channel = client.channels.get(channelName, { params: { rewind: '2m' } });
        await channel.subscribe((message) => {
          if (realtime !== createdClient) return;
          onInvalidate?.({
            aggregateId: message?.data?.aggregateId,
            eventId: message?.data?.eventId || message?.id,
            type: message?.name || 'state.updated',
          });
        });
      }
    }

    function stopRealtime() {
      const active = realtime;
      realtime = null;
      try { active?.close(); } catch { /* Session cleanup remains decisive. */ }
    }

    return {
      hasSession() { return Boolean(session?.access_token && session?.refresh_token); },
      async signIn(email, password) {
        const passwordSession = await authRequest('/token?grant_type=password', { email, password });
        const passwordPayload = decodeJwtPayload(passwordSession.access_token || '');
        if (passwordPayload.aal === 'aal2') {
          saveSession(passwordSession);
          clearPendingAuth();
          return { authenticated: true };
        }

        const factors = Array.isArray(passwordSession.user?.factors)
          ? passwordSession.user.factors
          : [];
        const verifiedFactors = factors.filter((item) =>
          ['totp', 'phone'].includes(factorType(item)) && item.status === 'verified');
        const factor = verifiedFactors.find((item) => factorType(item) === 'totp')
          || verifiedFactors[0];
        pendingSession = passwordSession;
        if (!factor) {
          return {
            requiresEnrollment: true,
            methods: { totp: true, phone: false },
          };
        }
        pendingFactor = factor;
        if (factorType(factor) === 'phone') {
          const challenge = await authRequest(
            `/factors/${encodeURIComponent(factor.id)}/challenge`,
            { factorId: factor.id },
            passwordSession.access_token,
          );
          pendingChallengeId = challenge.id;
        }
        return {
          requiresChallenge: true,
          method: factorType(factor),
          phone: factor.phone || null,
        };
      },
      verifyPendingChallenge,
      async enrollTotp() {
        if (!pendingSession?.access_token) {
          throw new Error('Sign in with your Doji account before setting up verification.');
        }
        const staleFactors = Array.isArray(pendingSession.user?.factors)
          ? pendingSession.user.factors.filter((item) => factorType(item) === 'totp' && item.status !== 'verified')
          : [];
        for (const stale of staleFactors) {
          await authRequest(`/factors/${encodeURIComponent(stale.id)}`, null, pendingSession.access_token, 'DELETE');
        }
        const enrollment = await authRequest('/factors', {
          factor_type: 'totp',
          friendly_name: 'Doji Admin',
          issuer: 'Doji Admin',
        }, pendingSession.access_token);
        if (enrollment?.type !== 'totp') {
          throw new Error('Doji authentication returned the wrong verification-factor type.');
        }
        if (!enrollment.totp || typeof enrollment.totp.qr_code !== 'string') {
          throw new Error('Doji authentication did not return the authenticator QR code.');
        }
        if (typeof enrollment.totp.secret !== 'string' || !enrollment.totp.secret) {
          throw new Error('Doji authentication did not return the authenticator setup key.');
        }
        pendingEnrollment = enrollment;
        pendingFactor = enrollment;
        pendingChallengeId = null;
        return {
          id: enrollment.id,
          qrCode: normalizedTotpQrCode(enrollment.totp.qr_code),
          secret: enrollment.totp.secret,
        };
      },
      async verifyTotpEnrollment(code) {
        if (!pendingEnrollment?.id) {
          throw new Error('Choose Authenticator app to begin setup.');
        }
        return verifyPendingChallenge(code);
      },
      session: () => portalRequest('/portal/admin/session'),
      commandCenter: (limit = 20) => portalRequest(`/portal/admin/command-center?limit=${limit}`),
      reportCase: (reportId) => portalRequest(`/portal/admin/report-case?id=${encodeURIComponent(reportId)}`),
      appeals: (limit = 20) => portalRequest(`/portal/admin/appeals?limit=${limit}`),
      triageReport: (input) => portalRequest('/portal/admin/report-triage', {
        method: 'POST',
        body: input,
      }),
      decideReport: (input) => portalRequest('/portal/admin/report-decision', {
        method: 'POST',
        body: input,
      }),
      decideAppeal: (input) => portalRequest('/portal/admin/appeal-decision', {
        method: 'POST',
        body: input,
      }),
      signEvidence,
      startRealtime,
      stopRealtime,
      async signOut() {
        stopRealtime();
        if (session?.access_token) {
          try { await authRequest('/logout', {}, session.access_token); } catch { /* Local cleanup is decisive. */ }
        }
        saveSession(null);
      },
      clearSession() { stopRealtime(); saveSession(null); clearPendingAuth(); },
    };
  }

  window.DojiAdminPortalClient = Object.freeze({ create });
})();
