import type { Realtime, TokenRequest } from 'ably';
import type {
  PortalConfig,
  AuthSession,
  AuthFactor,
  PortalAuthorization,
  Cursor,
  RequestOptions,
  InvalidationHint,
} from './live-contracts.d.mts';
function errorStatus(error: unknown) {
  return error !== null && typeof error === 'object' && 'status' in error
    ? error.status
    : undefined;
}
function jsonRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
const adminPortalClient = (() => {
  const storageKey = 'doji-admin-session-v1';
  const ablyScriptUrl = 'https://cdn.ably.com/lib/ably.min-2.js';
  const idleTimeoutMs = 30 * 60 * 1000;
  const absoluteTimeoutMs = 8 * 60 * 60 * 1000;
  let ablyLoadTask: Promise<NonNullable<Window['Ably']>> | null = null;

  function loadAbly() {
    if (window.Ably?.Realtime) return Promise.resolve(window.Ably);
    if (ablyLoadTask) return ablyLoadTask;
    ablyLoadTask = new Promise<NonNullable<Window['Ably']>>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = ablyScriptUrl;
      script.async = true;
      script.crossOrigin = 'anonymous';
      script.onload = () =>
        window.Ably?.Realtime
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

  function normalizedUrl(value: unknown) {
    return String(value || '').replace(/\/$/, '');
  }

  function normalizedTotpQrCode(value: unknown) {
    const qrCode = String(value || '');
    if (!qrCode) return '';
    return `data:image/svg+xml;utf-8,${qrCode}`;
  }

  function decodeJwtPayload(token: string): Record<string, unknown> {
    try {
      const encoded = token.split('.')[1]!.replace(/-/g, '+').replace(/_/g, '/');
      return jsonRecord(JSON.parse(atob(encoded.padEnd(Math.ceil(encoded.length / 4) * 4, '='))));
    } catch {
      return {};
    }
  }

  async function responseJson<T = unknown>(response: Response, fallback: string): Promise<T> {
    const text = await response.text();
    let body: unknown;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = null;
    }
    if (!response.ok) {
      const data = jsonRecord(body);
      const message = data.msg || data.message || data.error_description || data.error || fallback;
      const error = Object.assign(new Error(String(message)), { status: response.status });
      throw error;
    }
    return body as T;
  }

  function create(config: PortalConfig) {
    const supabaseUrl = normalizedUrl(config.supabaseUrl);
    const apiBaseUrl = normalizedUrl(config.apiBaseUrl);
    const anonKey = String(config.supabaseAnonKey || '');
    const employeeMode = config.employeeAccountsEnabled === true;
    const independentMode = config.independentEmployeeIdentity === true;
    if (independentMode && (!employeeMode || !window.DojiEmployeeTransport?.create)) {
      throw new Error('The independent employee connection is unavailable.');
    }
    if (!independentMode && (!supabaseUrl || !apiBaseUrl || !anonKey)) {
      throw new Error('The live admin portal is missing its public deployment configuration.');
    }

    let session: AuthSession | null = null;
    let realtime: Realtime | null = null;
    let pendingSession: AuthSession | null = null;
    let pendingFactor: AuthFactor | null = null;
    let pendingChallengeId: string | null = null;
    let pendingEnrollment: AuthFactor | null = null;
    let refreshTask: Promise<string> | null = null;
    let sessionRevision = 0;
    let sessionEpoch = 0;
    let authorizationTask: Promise<PortalAuthorization> | null = null;
    let authorizationFingerprint: string | null = null;
    const independent = independentMode
      ? window.DojiEmployeeTransport!.create({
          ...config,
          independentEmployeeIdentity: true,
          onAccessInvalidated(message) {
            stopRealtime();
            sessionEpoch += 1;
            authorizationTask = null;
            authorizationFingerprint = null;
            config.onAccessInvalidated?.(message);
          },
        })
      : null;
    if (!independentMode) {
      try {
        session = JSON.parse(sessionStorage.getItem(storageKey) || 'null');
      } catch {
        session = null;
      }
    }
    if (session) {
      const restoredAt = Date.now();
      session.started_at = Number(session.started_at || restoredAt);
      session.last_activity_at = Number(session.last_activity_at || restoredAt);
      sessionStorage.setItem(storageKey, JSON.stringify(session));
    }

    function saveSession(value: AuthSession | null) {
      if (value && employeeMode && decodeJwtPayload(value.access_token).role !== 'doji_employee') {
        saveSession(null);
        throw new Error('Use your separate employee account to access the portal.');
      }
      if (!value || !session || session.user?.id !== value.user?.id) sessionEpoch += 1;
      if (!value || session?.user?.id !== value.user?.id) {
        authorizationFingerprint = null;
        authorizationTask = null;
      }
      sessionRevision += 1;
      const previous = session;
      const now = Date.now();
      const sameUser = previous?.user?.id && previous.user.id === value?.user?.id;
      session = value
        ? {
            access_token: value.access_token,
            refresh_token: value.refresh_token,
            expires_at:
              value.expires_at || Math.floor(Date.now() / 1000) + Number(value.expires_in || 3600),
            user: value.user,
            started_at: sameUser ? Number(previous.started_at || now) : now,
            last_activity_at: sameUser ? Number(previous.last_activity_at || now) : now,
          }
        : null;
      if (session) sessionStorage.setItem(storageKey, JSON.stringify(session));
      else sessionStorage.removeItem(storageKey);
    }

    function sessionExpired() {
      if (!session) return true;
      const now = Date.now();
      return (
        now - Number(session.last_activity_at || 0) > idleTimeoutMs ||
        now - Number(session.started_at || 0) > absoluteTimeoutMs
      );
    }

    function assertSessionFresh() {
      if (independent) return independent.assertSessionFresh();
      if (!session?.access_token) throw new Error('Sign in to continue.');
      if (!sessionExpired()) return;
      stopRealtime();
      saveSession(null);
      refreshTask = null;
      throw new Error('Your protected admin session expired. Sign in again.');
    }

    function noteActivity() {
      if (independent) return independent.noteActivity();
      if (!session || sessionExpired()) return false;
      const now = Date.now();
      if (now - Number(session.last_activity_at || 0) < 30_000) return true;
      session.last_activity_at = now;
      sessionStorage.setItem(storageKey, JSON.stringify(session));
      return true;
    }

    async function authRequest<T = unknown>(
      path: string,
      body: unknown,
      accessToken?: string,
      method = 'POST',
    ): Promise<T> {
      const epoch = sessionEpoch;
      const response = await fetch(`${supabaseUrl}/auth/v1${path}`, {
        method,
        headers: {
          apikey: anonKey,
          authorization: `Bearer ${accessToken || anonKey}`,
          'content-type': 'application/json',
        },
        body: method === 'DELETE' ? undefined : JSON.stringify(body || {}),
      });
      const result = await responseJson<T>(response, 'Authentication failed.');
      if (epoch !== sessionEpoch) throw new Error('Your admin session changed. Sign in again.');
      return result;
    }

    function clearPendingAuth() {
      pendingSession = null;
      pendingFactor = null;
      pendingChallengeId = null;
      pendingEnrollment = null;
    }

    function factorType(factor: AuthFactor | null | undefined) {
      return factor?.factor_type || factor?.type || '';
    }

    async function verifyPendingChallenge(code: string) {
      if (independent) return independent.verifyPendingChallenge(code);
      if (!pendingSession?.access_token || !pendingFactor?.id) {
        throw new Error('Start the protected sign-in again.');
      }
      if (!/^\d{6}$/.test(String(code || '').trim())) {
        throw new Error('Enter the current six-digit verification code.');
      }
      if (!pendingChallengeId) {
        const challenge = await authRequest<{ id: string }>(
          `/factors/${encodeURIComponent(pendingFactor.id)}/challenge`,
          { factorId: pendingFactor.id },
          pendingSession.access_token,
        );
        pendingChallengeId = challenge.id;
      }
      const verified = await authRequest<AuthSession>(
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
      assertSessionFresh();
      if (!session?.refresh_token)
        throw new Error('Your admin session has expired. Sign in again.');
      if (refreshTask) return refreshTask;
      const refreshToken = session.refresh_token;
      const refreshRevision = sessionRevision;
      refreshTask = (async () => {
        const refreshed = await authRequest<AuthSession>('/token?grant_type=refresh_token', {
          refresh_token: refreshToken,
        });
        if (sessionRevision !== refreshRevision) {
          throw new Error('Your admin session changed. Sign in again.');
        }
        saveSession(refreshed);
        return refreshed.access_token;
      })().finally(() => {
        refreshTask = null;
      });
      return refreshTask;
    }

    async function accessToken() {
      assertSessionFresh();
      if (Number(session!.expires_at || 0) <= Math.floor(Date.now() / 1000) + 60) {
        return refresh();
      }
      return session!.access_token;
    }

    function invalidatePortalAccess(message: string) {
      if (independent) {
        stopRealtime();
        sessionEpoch += 1;
        authorizationTask = null;
        authorizationFingerprint = null;
        independent.clearSession();
        config.onAccessInvalidated?.(message);
        return;
      }
      if (!session) return;
      stopRealtime();
      saveSession(null);
      clearPendingAuth();
      config.onAccessInvalidated?.(message);
    }

    function verifyPortalAccess() {
      if (authorizationTask) return authorizationTask;
      const epoch = sessionEpoch;
      const task = (async () => {
        try {
          const result = await portalRequest<PortalAuthorization>('/portal/admin/session');
          if (epoch !== sessionEpoch) throw new Error('Your admin session changed. Sign in again.');
          const fingerprint = JSON.stringify([
            result?.user_id,
            [...(result?.roles || [])].sort(),
            Object.entries(result?.capabilities || {}).sort(([a], [b]) => a.localeCompare(b)),
          ]);
          if (authorizationFingerprint && authorizationFingerprint !== fingerprint) {
            invalidatePortalAccess(
              'Your workspace permissions changed. Sign in again to continue.',
            );
            throw new Error('Your workspace permissions changed. Sign in again to continue.');
          }
          authorizationFingerprint = fingerprint;
          return result;
        } catch (error) {
          if (
            epoch === sessionEpoch &&
            (errorStatus(error) === 401 || errorStatus(error) === 403)
          ) {
            invalidatePortalAccess(
              'Your employee access is no longer authorized. Contact an administrator or sign in again.',
            );
          }
          throw error;
        }
      })();
      authorizationTask = task;
      void task
        .finally(() => {
          if (authorizationTask === task) authorizationTask = null;
        })
        .catch(() => {});
      return task;
    }

    async function portalRequest<T = unknown>(
      path: string,
      options: RequestOptions = {},
    ): Promise<T> {
      if (independent) return (await independent.request(path, options)) as T;
      const epoch = sessionEpoch;
      const method = options.method || 'GET';
      const requestBody = options.body;
      // Fixed takedown RPC allowlist; employee JWT and the same epoch/refresh
      // guards apply. No service credential or generic browser RPC caller.
      const safetyRpc = (
        {
          '/safety/page': 'get_admin_safety_removals_v1',
          '/safety/case': 'get_admin_safety_removal_v1',
          '/safety/target': 'get_admin_safety_target_v1',
          '/safety/create-report': 'admin_create_safety_report_v1',
          '/safety/command': 'admin_safety_removal_command_v1',
        } as Readonly<Record<string, string>>
      )[path];
      const businessRpc =
        config.businessApplicationsEnabled === true && config.employeeAccountsEnabled === true
          ? (
              {
                '/business/page': 'get_admin_business_applications_page_v1',
                '/business/item': 'get_admin_business_application_v1',
                '/business/command': 'admin_business_application_command_v1',
              } as Readonly<Record<string, string>>
            )[path]
          : null;
      if (path.startsWith('/business/') && !businessRpc)
        throw new Error('Business review is not enabled.');
      const privacyRpc =
        config.businessPrivacyEnabled === true && employeeMode
          ? (
              {
                '/business-privacy/page': 'get_admin_business_privacy_page_v1',
                '/business-privacy/case': 'get_admin_business_privacy_case_v1',
                '/business-privacy/access': 'get_admin_business_privacy_access_v1',
                '/business-privacy/correction': 'get_admin_business_privacy_correction_v1',
                '/business-privacy/open': 'admin_business_privacy_open_v1',
                '/business-privacy/command': 'admin_business_privacy_command_v1',
              } as Readonly<Record<string, string>>
            )[path]
          : null;
      if (path.startsWith('/business-privacy/') && !privacyRpc)
        throw new Error('Business privacy is not enabled.');
      const directRpc = safetyRpc || businessRpc || privacyRpc;
      const request = (token: string) =>
        fetch(directRpc ? `${supabaseUrl}/rest/v1/rpc/${directRpc}` : `${apiBaseUrl}${path}`, {
          method,
          cache: 'no-store',
          headers: {
            authorization: `Bearer ${token}`,
            'x-client-info': 'doji-admin-portal/1.0',
            ...(directRpc ? { apikey: anonKey } : {}),
            ...(requestBody === undefined ? {} : { 'content-type': 'application/json' }),
          },
          body: requestBody === undefined ? undefined : JSON.stringify(requestBody),
          signal: AbortSignal.timeout(15000),
        });
      let token = await accessToken();
      if (epoch !== sessionEpoch) throw new Error('Your admin session changed. Sign in again.');
      let response = await request(token);
      if (epoch !== sessionEpoch) throw new Error('Your admin session changed. Sign in again.');
      if (response.status === 401) {
        token = await refresh();
        if (epoch !== sessionEpoch) throw new Error('Your admin session changed. Sign in again.');
        response = await request(token);
      }
      if (epoch !== sessionEpoch) throw new Error('Your admin session changed. Sign in again.');
      if ([401, 403].includes(response.status) && path !== '/portal/admin/session') {
        // A case-level denial is not necessarily a revoked employee session.
        // Coalesce one authoritative capability check, without replaying the command.
        try {
          await verifyPortalAccess();
        } catch (error) {
          if (epoch === sessionEpoch)
            invalidatePortalAccess(
              'Employee access could not be verified after a denied request. Sign in again.',
            );
          throw error;
        }
      }
      const result = await responseJson<T>(
        response,
        'The admin portal could not load production data.',
      );
      if (epoch !== sessionEpoch) throw new Error('Your admin session changed. Sign in again.');
      assertSessionFresh();
      return result;
    }

    async function realtimeToken() {
      return portalRequest<TokenRequest>('/portal/admin/realtime-token');
    }

    async function signEvidence(bucket: string, objectPath: string) {
      if (independent) return independent.signEvidence(bucket, objectPath);
      const epoch = sessionEpoch;
      if (!bucket || !objectPath) return null;
      if (
        !['post-media', 'avatars', 'moderation-evidence'].includes(bucket) ||
        String(objectPath)
          .split('/')
          .some((part) => !part || part === '.' || part === '..') ||
        (bucket === 'moderation-evidence' &&
          !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\/original$/.test(
            objectPath,
          ))
      ) {
        throw new Error('Invalid evidence reference.');
      }
      const encodedPath = String(objectPath).split('/').map(encodeURIComponent).join('/');
      const request = async (token: string) =>
        fetch(
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
            signal: AbortSignal.timeout(15_000),
          },
        );
      let token = await accessToken();
      if (epoch !== sessionEpoch) throw new Error('Your admin session changed. Sign in again.');
      let response = await request(token);
      if (epoch !== sessionEpoch) throw new Error('Your admin session changed. Sign in again.');
      if (response.status === 401) {
        token = await refresh();
        if (epoch !== sessionEpoch) throw new Error('Your admin session changed. Sign in again.');
        response = await request(token);
      }
      const body = await responseJson<{ signedURL?: string; signedUrl?: string }>(
        response,
        'The report evidence could not be authorized.',
      );
      if (epoch !== sessionEpoch) throw new Error('Your admin session changed. Sign in again.');
      assertSessionFresh();
      const signedPath = body?.signedURL || body?.signedUrl;
      if (!signedPath) throw new Error('The report evidence URL was not returned.');
      const normalizedPath = signedPath.startsWith('/storage/v1/')
        ? signedPath
        : `/storage/v1/${signedPath.replace(/^\/+/, '')}`;
      const signedUrl = new URL(
        signedPath.startsWith('http') ? signedPath : `${supabaseUrl}${normalizedPath}`,
      );
      if (
        signedUrl.origin !== new URL(supabaseUrl).origin ||
        !signedUrl.pathname.startsWith(`/storage/v1/object/sign/${bucket}/`)
      ) {
        throw new Error('The evidence URL did not match the authorized Storage service.');
      }
      return signedUrl.href;
    }

    async function startRealtime(
      onInvalidate?: (hint: InvalidationHint) => void,
      onStateChange?: (state: string) => void,
    ) {
      if (realtime) return;
      const epoch = sessionEpoch;
      const Ably = await loadAbly();
      if (epoch !== sessionEpoch) return;
      assertSessionFresh();
      let createdClient: Realtime | null = null;
      const client = new Ably.Realtime({
        autoConnect: false,
        echoMessages: false,
        realtimeRequestTimeout: 20_000,
        authCallback: (_params, callback) => {
          realtimeToken().then(
            (tokenRequest) => callback(null, tokenRequest),
            (error) =>
              callback(
                error instanceof Error ? error.message : 'Realtime authentication failed',
                null,
              ),
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
      try {
        active?.close();
      } catch {
        /* Session cleanup remains decisive. */
      }
    }

    return {
      async registerEmployee(displayName: string, email: string, password: string) {
        if (independent)
          throw new Error('Employee accounts are invitation-only. Contact your administrator.');
        if (!employeeMode) throw new Error('Employee registration is not enabled.');
        const response = await fetch(`${supabaseUrl}/functions/v1/employee-register`, {
          method: 'POST',
          headers: { apikey: anonKey, 'content-type': 'application/json' },
          body: JSON.stringify({ displayName, email, password }),
          signal: AbortSignal.timeout(15000),
        });
        return responseJson(response, 'Employee registration could not be completed.');
      },
      async resendEmployeeVerification(email: string) {
        if (independent)
          throw new Error('Use your employee invitation or contact your administrator.');
        if (!employeeMode) throw new Error('Employee registration is not enabled.');
        const response = await fetch(`${supabaseUrl}/functions/v1/employee-register`, {
          method: 'POST',
          headers: { apikey: anonKey, 'content-type': 'application/json' },
          body: JSON.stringify({ action: 'resend_verification', email }),
          signal: AbortSignal.timeout(15000),
        });
        return responseJson(response, 'Employee verification is unavailable.');
      },
      hasSession() {
        if (independent) return independent.hasSession();
        if (!session?.access_token || !session?.refresh_token || sessionExpired()) return false;
        if (employeeMode && decodeJwtPayload(session.access_token).role !== 'doji_employee')
          return false;
        return true;
      },
      noteActivity,
      sessionPolicy() {
        return { idleTimeoutMs, absoluteTimeoutMs };
      },
      async signIn(email: string, password: string) {
        if (independent) return independent.signIn(email, password);
        const epochBeforeLogin = sessionEpoch;
        const passwordSession = employeeMode
          ? await responseJson<AuthSession>(
              await fetch(`${supabaseUrl}/functions/v1/employee-signin`, {
                method: 'POST',
                headers: { apikey: anonKey, 'content-type': 'application/json' },
                body: JSON.stringify({ email, password }),
                signal: AbortSignal.timeout(15000),
              }),
              'Employee sign-in failed.',
            )
          : await authRequest<AuthSession>('/token?grant_type=password', { email, password });
        if (epochBeforeLogin !== sessionEpoch)
          throw new Error('Your admin session changed. Sign in again.');
        const passwordPayload = decodeJwtPayload(passwordSession.access_token || '');
        if (config.employeeAccountsEnabled !== true && passwordPayload.role === 'doji_employee') {
          try {
            await authRequest('/logout?scope=local', {}, passwordSession.access_token);
          } catch {
            /* No workspace access. */
          }
          clearPendingAuth();
          throw new Error(
            'Your work account belongs in Employee setup: admin.dojipro.com/employee-setup/. This portal has not switched to employee access yet.',
          );
        }
        if (employeeMode) {
          if (passwordPayload.role !== 'doji_employee') {
            // Do not enroll/challenge MFA on a personal account. Local logout
            // revokes only this newly created browser login, never the phone.
            try {
              await authRequest('/logout?scope=local', {}, passwordSession.access_token);
            } catch {
              /* no workspace access */
            }
            throw new Error(
              'Use your separate employee account. Your personal Doji account is for the app.',
            );
          }
          const epoch = sessionEpoch;
          const response = await fetch(
            `${supabaseUrl}/rest/v1/rpc/get_employee_registration_status_v1`,
            {
              method: 'POST',
              headers: {
                apikey: anonKey,
                authorization: `Bearer ${passwordSession.access_token}`,
                'content-type': 'application/json',
              },
              body: '{}',
              signal: AbortSignal.timeout(8000),
            },
          );
          const status = await responseJson<{ status: string }>(
            response,
            'Employee access could not be verified.',
          );
          if (epoch !== sessionEpoch) throw new Error('Your admin session changed. Sign in again.');
          if (status.status !== 'active') {
            try {
              await authRequest('/logout?scope=local', {}, passwordSession.access_token);
            } catch {
              /* fail closed */
            }
            throw new Error(
              status.status === 'pending'
                ? 'Your email is verified. Your employee account is awaiting administrator approval.'
                : 'Your employee access has been disabled. Contact your administrator.',
            );
          }
        }
        if (passwordPayload.aal === 'aal2') {
          saveSession(passwordSession);
          clearPendingAuth();
          return { authenticated: true };
        }

        const factors = Array.isArray(passwordSession.user?.factors)
          ? passwordSession.user.factors
          : [];
        const verifiedFactors = factors.filter(
          (item) => ['totp', 'phone'].includes(factorType(item)) && item.status === 'verified',
        );
        const factor =
          verifiedFactors.find((item) => factorType(item) === 'totp') || verifiedFactors[0];
        pendingSession = passwordSession;
        if (!factor) {
          return {
            requiresEnrollment: true,
            methods: { totp: true, phone: false },
          };
        }
        pendingFactor = factor;
        if (factorType(factor) === 'phone') {
          const challenge = await authRequest<{ id: string }>(
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
        if (independent) return independent.enrollTotp();
        if (!pendingSession?.access_token) {
          throw new Error('Sign in with your Doji account before setting up verification.');
        }
        const staleFactors = Array.isArray(pendingSession.user?.factors)
          ? pendingSession.user.factors.filter(
              (item) => factorType(item) === 'totp' && item.status !== 'verified',
            )
          : [];
        for (const stale of staleFactors) {
          await authRequest(
            `/factors/${encodeURIComponent(stale.id)}`,
            null,
            pendingSession.access_token,
            'DELETE',
          );
        }
        const enrollment = await authRequest<AuthFactor>(
          '/factors',
          {
            factor_type: 'totp',
            friendly_name: 'Doji Admin',
            issuer: 'Doji Admin',
          },
          pendingSession.access_token,
        );
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
      async verifyTotpEnrollment(code: string) {
        if (independent) return independent.verifyTotpEnrollment(code);
        if (!pendingEnrollment?.id) {
          throw new Error('Choose Authenticator app to begin setup.');
        }
        return verifyPendingChallenge(code);
      },
      session: verifyPortalAccess,
      businessPage: (input: Record<string, unknown>) =>
        portalRequest('/business/page', { method: 'POST', body: input }),
      businessItem: (id: string) =>
        portalRequest('/business/item', { method: 'POST', body: { p_id: id } }),
      businessCommand: (input: Record<string, unknown>) =>
        portalRequest('/business/command', { method: 'POST', body: input }),
      businessPrivacyPage: (input: Record<string, unknown>) =>
        portalRequest('/business-privacy/page', { method: 'POST', body: input }),
      businessPrivacyCase: (input: Record<string, unknown>) =>
        portalRequest('/business-privacy/case', { method: 'POST', body: input }),
      businessPrivacyAccess: (input: Record<string, unknown>) =>
        portalRequest('/business-privacy/access', { method: 'POST', body: input }),
      businessPrivacyCorrection: (input: Record<string, unknown>) =>
        portalRequest('/business-privacy/correction', { method: 'POST', body: input }),
      businessPrivacyOpen: (input: Record<string, unknown>) =>
        portalRequest('/business-privacy/open', { method: 'POST', body: input }),
      businessPrivacyCommand: (input: Record<string, unknown>) =>
        portalRequest('/business-privacy/command', { method: 'POST', body: input }),
      safetyPage: (cursor: Cursor | null = null, closed = false, queue = 'restricted_safety') =>
        portalRequest('/safety/page', {
          method: 'POST',
          body: {
            p_after_at: cursor?.at || null,
            p_after_id: cursor?.id || null,
            p_closed: closed,
            p_queue: queue,
          },
        }),
      safetyCase: (id: string) =>
        portalRequest('/safety/case', { method: 'POST', body: { p_id: id } }),
      safetyTarget: (id: string, kind: string, targetId: string) =>
        portalRequest('/safety/target', {
          method: 'POST',
          body: { p_case_id: id, p_kind: kind, p_target_id: targetId },
        }),
      safetyCreateReport: (input: Record<string, unknown>) =>
        portalRequest('/safety/create-report', { method: 'POST', body: input }),
      safetyCommand: (input: Record<string, unknown>) =>
        portalRequest('/safety/command', { method: 'POST', body: input }),
      editorialPage: (kind: string, cursor: Cursor | null = null, filter = 'all') => {
        const query = new URLSearchParams({ kind, limit: '25', filter });
        if (cursor?.at && cursor?.id) {
          query.set('beforeAt', cursor.at);
          query.set('beforeId', cursor.id);
        }
        return portalRequest(`/portal/admin/editorial-page?${query}`);
      },
      editorialItem: (kind: string, id: string) =>
        portalRequest(`/portal/admin/editorial-item?${new URLSearchParams({ kind, id })}`),
      editorialCommand: (input: Record<string, unknown>) =>
        portalRequest('/portal/admin/editorial-command', { method: 'POST', body: input }),
      commandCenter: (limit = 20) => portalRequest(`/portal/admin/command-center?limit=${limit}`),
      workQueue: (
        filters: Partial<Record<'queue' | 'filter' | 'search', string>> = {},
        cursor: Cursor | null = null,
      ) => {
        const query = new URLSearchParams({
          limit: '25',
          queue: filters.queue || 'all',
          filter: filters.filter || 'all',
        });
        if (filters.search) query.set('search', filters.search);
        if (cursor?.at && cursor?.id) {
          query.set('afterAt', cursor.at);
          query.set('afterId', cursor.id);
        }
        return portalRequest(`/portal/admin/work-queue?${query}`);
      },
      platformHealth: () => portalRequest('/portal/admin/platform-health'),
      platformHealthHistory: (limit = 12) =>
        portalRequest(`/portal/admin/platform-health-history?limit=${encodeURIComponent(limit)}`),
      auditEvents: (
        limit = 50,
        cursor: { occurred_at?: string; id?: string } | null = null,
        filters: Partial<Record<'category' | 'search', string>> = {},
      ) => {
        const query = new URLSearchParams({ limit: String(limit) });
        if (cursor?.occurred_at && cursor?.id) {
          query.set('beforeOccurredAt', cursor.occurred_at);
          query.set('beforeId', cursor.id);
        }
        query.set('category', filters.category || 'activity');
        if (filters.search) query.set('search', filters.search);
        return portalRequest(`/portal/admin/audit?${query.toString()}`);
      },
      auditExport: (filters: Partial<Record<'category' | 'search', string>> = {}) => {
        const query = new URLSearchParams({ category: filters.category || 'activity' });
        if (filters.search) query.set('search', filters.search);
        return portalRequest(`/portal/admin/audit-export?${query.toString()}`);
      },
      operators: () => portalRequest('/portal/admin/operators'),
      setOperatorRole: (input: Record<string, unknown>) =>
        portalRequest('/portal/admin/operator-role', {
          method: 'POST',
          body: input,
        }),
      reportCase: (reportId: string) =>
        portalRequest(`/portal/admin/report-case-v3?id=${encodeURIComponent(reportId)}`),
      appealCase: (appealId: string) =>
        portalRequest(`/portal/admin/appeal-case?id=${encodeURIComponent(appealId)}`),
      resolvedReports: (
        limit = 25,
        cursor: { resolved_at?: string; report_id?: string } | null = null,
      ) => {
        const query = new URLSearchParams({ limit: String(limit) });
        if (cursor?.resolved_at && cursor?.report_id) {
          query.set('beforeResolvedAt', cursor.resolved_at);
          query.set('beforeReportId', cursor.report_id);
        }
        return portalRequest(`/portal/admin/resolved-reports?${query.toString()}`);
      },
      appeals: (limit = 20) => portalRequest(`/portal/admin/appeals?limit=${limit}`),
      triageReport: (input: Record<string, unknown>) =>
        portalRequest('/portal/admin/report-triage', {
          method: 'POST',
          body: input,
        }),
      setReportReviewState: (input: Record<string, unknown>) =>
        portalRequest('/portal/admin/report-review-state', {
          method: 'POST',
          body: input,
        }),
      decideReport: (input: Record<string, unknown>) =>
        portalRequest('/portal/admin/report-decision', {
          method: 'POST',
          body: input,
        }),
      decideAppeal: (input: Record<string, unknown>) =>
        portalRequest('/portal/admin/appeal-decision', {
          method: 'POST',
          body: input,
        }),
      signEvidence,
      startRealtime,
      stopRealtime,
      async signOut() {
        stopRealtime();
        if (independent) {
          sessionEpoch += 1;
          authorizationTask = null;
          authorizationFingerprint = null;
          return independent.signOut();
        }
        const accessToken = session?.access_token;
        saveSession(null);
        refreshTask = null;
        if (accessToken) {
          // The operator may use the same Doji identity in the member app.
          // Supabase logout defaults to global scope, which would revoke that
          // phone's refresh token when this browser workspace is locked.
          try {
            await authRequest('/logout?scope=local', {}, accessToken);
          } catch {
            /* Local cleanup is decisive. */
          }
        }
      },
      clearSession() {
        stopRealtime();
        if (independent) {
          sessionEpoch += 1;
          authorizationTask = null;
          authorizationFingerprint = null;
          independent.clearSession();
          return;
        }
        saveSession(null);
        clearPendingAuth();
      },
    };
  }

  return Object.freeze({ create });
})();
declare global {
  interface Window {
    DojiAdminPortalClient: typeof adminPortalClient;
  }
}
window.DojiAdminPortalClient = adminPortalClient;
export type AdminPortalClient = ReturnType<typeof adminPortalClient.create>;
