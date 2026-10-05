// Separate from the localStorage/sample workspace. Tokens live only in memory.
import type { BusinessFactor } from './business-mfa.mts';
import type { TokenRequest } from 'ably';
export interface BusinessConfig {
  enabled: boolean;
  supabaseUrl: string;
  anonKey: string;
  realtimeEnabled?: boolean;
  publicAdmission?: boolean;
  termsVersion?: string;
  privacyVersion?: string;
  termsUrl?: string;
  privacyUrl?: string;
  turnstileSiteKey?: string;
}
declare global {
  interface Window {
    DOJI_BUSINESS_APPLICATION_CONFIG?: BusinessConfig;
  }
}
interface AuthSession {
  user: {
    id: string;
    role: string;
    email_confirmed_at?: string;
    app_metadata?: { account_type?: string };
  };
  access_token: string;
  refresh_token: string;
  expires_in?: number;
  expires_at: number;
  business_flow?: string;
}
export interface ApplicationRecord {
  revision: number;
  state?: string;
  response?: string;
  details?: Record<string, unknown>;
}
export interface ApplicationCommand {
  p_action: string;
  p_revision: number | null;
  p_details: Record<string, unknown>;
  p_terms_version: string | null;
  p_privacy_version: string | null;
  p_request_id: string;
}
export interface ApplicationClient {
  epoch(): number;
  onClear(fn: () => void): () => void;
  read(): Promise<ApplicationRecord | null | undefined>;
  command(body: ApplicationCommand): Promise<{ application: ApplicationRecord | null }>;
}
export interface ApplicationSnapshot {
  application: ApplicationRecord | null | undefined;
  draft: Record<string, unknown>;
  dirty: boolean;
  stale: boolean;
  pending: boolean;
  error: string;
  loaded: boolean;
  loading: boolean;
  lastCheckedAt: number | null;
  readError: string;
  draftVersion: number;
}
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}
function statusOf(value: unknown) {
  return record(value) && typeof value.status === 'number' ? value.status : undefined;
}
export function createBusinessApplicationClient(
  config: BusinessConfig,
  request: typeof fetch = fetch,
) {
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
        JSON.parse(
          atob((config.anonKey.split('.')[1] || '').replaceAll('-', '+').replaceAll('_', '/')),
        ).role !== 'anon'
      )
        throw Error();
    } catch {
      throw Error('Only a public anonymous key is permitted in the browser.');
    }
  }
  let session: AuthSession | null = null,
    epoch = 0,
    refreshTask: Promise<string> | null = null,
    recovery = false;
  const listeners = new Set<() => void>();
  const identity = (value: unknown): value is AuthSession =>
    record(value) &&
    record(value.user) &&
    value.user.role === 'doji_business' &&
    record(value.user.app_metadata) &&
    value.user.app_metadata.account_type === 'business' &&
    Boolean(value.user.email_confirmed_at) &&
    typeof value.access_token === 'string' &&
    typeof value.refresh_token === 'string';
  const clear = () => {
    session = null;
    recovery = false;
    epoch++;
    refreshTask = null;
    listeners.forEach((fn) => fn());
  };
  // Wire types describe the existing endpoint contracts; auth identity is still
  // checked at each session boundary, never granted by a TypeScript assertion.
  async function call<T = unknown>(
    path: string,
    body: unknown,
    token?: string,
    method = 'POST',
  ): Promise<T> {
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
    const data: unknown = await response.json().catch(() => {
      // An unreadable successful RPC response is not an authoritative empty record.
      if (response.ok && path.startsWith('/rest/v1/rpc/'))
        throw Error('The server response could not be read. Please try again.');
      return null;
    });
    if (!response.ok) {
      const error = Object.assign(
        Error(
          (record(data) && typeof data.message === 'string' && data.message) ||
            'The request could not be completed.',
        ),
        {
          status: response.status,
          code: record(data) ? data.code : undefined,
        },
      );
      throw error;
    }
    return data as T;
  }
  async function auth(action: string, fields: Record<string, unknown>) {
    return call('/functions/v1/business-auth', { ...fields, action });
  }
  async function signin(fields: Record<string, unknown>) {
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
  async function rpc<T>(name: string, body: object = {}): Promise<T> {
    const stamp = epoch;
    try {
      const bearer = await token();
      if (stamp !== epoch) throw Error('This session has ended.');
      const data = await call<T>(`/rest/v1/rpc/${name}`, body, bearer);
      if (stamp !== epoch) throw Error('This session has ended.');
      return data;
    } catch (error) {
      if (stamp === epoch && (statusOf(error) === 401 || statusOf(error) === 403)) clear();
      throw error;
    }
  }
  async function protectedAuth<T = unknown>(
    path: string,
    body: unknown,
    method = 'POST',
  ): Promise<T> {
    const stamp = epoch;
    const bearer = await token();
    if (stamp !== epoch) throw Error('This session has ended.');
    try {
      const data = await call<T>(`/auth/v1/${path}`, body, bearer, method);
      if (stamp !== epoch) throw Error('This session has ended.');
      return data;
    } catch (error) {
      if (stamp === epoch && statusOf(error) === 401) clear();
      throw error;
    }
  }
  async function factors() {
    const user = await protectedAuth<
      AuthSession['user'] & { factors?: (BusinessFactor & { factor_type: string })[] }
    >('user', undefined, 'GET');
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
        atob((session?.access_token.split('.')[1] || '').replaceAll('-', '+').replaceAll('_', '/')),
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
    onClear(fn: () => void) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    read: () => rpc<ApplicationRecord | null>('get_business_application_v1'),
    command: (body: ApplicationCommand) =>
      rpc<{ application: ApplicationRecord | null }>('business_application_command_v1', body),
    workspace: () => rpc<{ brand_name?: string }>('get_business_workspace_v1'),
    async realtimeToken() {
      if (config.realtimeEnabled !== true) throw Error('Business realtime is not enabled.');
      const stamp = epoch;
      const bearer = await token();
      if (stamp !== epoch) throw Error('This session has ended.');
      try {
        const result = await call<{ topic: string; tokenRequest: TokenRequest }>(
          '/functions/v1/business-realtime-token',
          {},
          bearer,
        );
        if (stamp !== epoch) throw Error('This session has ended.');
        if (
          result?.topic !== `business:${session?.user.id}:events` ||
          result?.tokenRequest?.clientId !== `business:${session?.user.id}`
        )
          throw Error('Business realtime identity could not be verified.');
        return result;
      } catch (error) {
        if (stamp === epoch && [401, 403].includes(statusOf(error) ?? 0)) clear();
        throw error;
      }
    },
    factors,
    assurance,
    async verifyLink(ticket: string) {
      clear();
      const stamp = epoch;
      const next = await auth('verify', { ticket });
      if (stamp !== epoch) throw Error('This verification is no longer active.');
      if (!identity(next) || !['signup', 'recovery'].includes(next.business_flow || ''))
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
      return protectedAuth<BusinessFactor>('factors', {
        factor_type: 'totp',
        friendly_name: 'Doji Business',
        issuer: 'Doji Business',
      });
    },
    async verifyFactor(factorId: string, code: string) {
      if (!/^[0-9]{6}$/.test(code)) throw Error('Enter the six-digit authenticator code.');
      const id = session?.user.id;
      const path = `factors/${encodeURIComponent(factorId)}`;
      const challenge = await protectedAuth<{ id: string }>(`${path}/challenge`, {});
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
    async resetPassword(password: string) {
      if (!recovery || password.length < 12 || password.length > 128)
        throw Error('Use a recovery link and a new password of 12–128 characters.');
      const list = await factors();
      if (list.some((f) => f.status === 'verified') && assurance() !== 'aal2')
        throw Error('Verify your existing authenticator before changing the password.');
      const user = await protectedAuth<AuthSession['user']>('user', { password }, 'PUT');
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
export function createApplicationController(
  client: ApplicationClient,
  changed: (state: ApplicationSnapshot) => void = () => {},
) {
  let application: ApplicationRecord | null | undefined = null,
    draft: Record<string, unknown> = {},
    dirty = false,
    stale = false,
    pending = false,
    loaded = false,
    loading = false,
    lastCheckedAt: number | null = null,
    readError = '',
    draftVersion = 0,
    intent: { fingerprint: string; id: string } | null = null,
    error = '',
    generation = 0;
  let activeRead: Promise<void> | null = null,
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
  async function command(action: string, termsVersion?: string, privacyVersion?: string) {
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
      error = failure instanceof Error ? failure.message : String(failure);
      if (record(failure) && ['PT409', '40001'].includes(String(failure.code))) stale = true;
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
    edit(key: string, value: unknown) {
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
