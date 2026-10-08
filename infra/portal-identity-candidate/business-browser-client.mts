// Staging candidate. No import from deployed portal. Compatible with the existing
// application controller; tokens/cookies are never read by JavaScript or persisted.
import { errorStatus, isBusinessApplication, isRecord } from './business-contracts.mts';
import type { BusinessSession } from './business-contracts.mts';
export interface BusinessBrowserConfig {
  origin: string;
  enabled: boolean;
  realm: 'business';
}
export type BrowserRequest = (url: string, options: RequestInit) => Promise<Response>;
export function createBusinessBrowserClient(
  config: BusinessBrowserConfig,
  request: BrowserRequest = fetch,
) {
  const base = new URL(config.origin);
  if (
    config?.enabled !== true ||
    base.protocol !== 'https:' ||
    base.origin !== config.origin ||
    config.realm !== 'business'
  )
    throw Error('Business identity is not enabled.');
  let session: BusinessSession | null = null;
  let generation = 0;
  let restoreTask: Promise<boolean> | null = null;
  const listeners = new Set<() => void>();
  const clear = () => {
    generation++;
    session = null;
    restoreTask = null;
    for (const listener of listeners) listener();
  };
  async function call(path: string, data?: unknown, csrf?: string): Promise<unknown> {
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
    let result: unknown;
    try {
      result = await response.json();
    } catch {
      throw Error('The server response could not be read. Please retry.');
    }
    if (!response.ok) {
      const error = Object.assign(
        Error(
          path === '/api/application' && data !== undefined && response.status === 400
            ? 'Some application details were not accepted. Check the required fields and HTTPS website address, then submit again. Your entries are still here.'
            : response.status === 409
              ? 'This record changed. Refresh before trying again.'
              : 'Business access could not be completed. Please retry or sign in again.',
        ),
        { status: response.status, ...(response.status === 409 ? { code: 'PT409' } : {}) },
      );
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
          !isRecord(value) ||
          value.signedIn !== true ||
          typeof value.csrf !== 'string' ||
          !/^[A-Za-z0-9_-]{43}$/.test(value.csrf) ||
          (value.assurance !== 'aal1' && value.assurance !== 'aal2')
        )
          throw Error('Business identity could not be verified.');
        session = { csrf: value.csrf, assurance: value.assurance };
        return true;
      })
      .catch((error: unknown) => {
        if (stamp === generation) clear();
        if (errorStatus(error) === 401) return false;
        throw error;
      })
      .finally(() => {
        if (stamp === generation) restoreTask = null;
      });
    restoreTask = task;
    return task;
  };
  async function protectedCall(path: string, body?: unknown): Promise<unknown> {
    const stamp = generation;
    if (!session) throw Error('Sign in with your business account.');
    try {
      const value = await call(path, body, session.csrf);
      if (stamp !== generation) throw Error('This session has ended.');
      return value;
    } catch (error) {
      const status = errorStatus(error);
      if (stamp === generation && (status === 401 || status === 403)) clear();
      throw error;
    }
  }
  return {
    restore,
    clear,
    hasSession: () => session !== null,
    epoch: () => generation,
    assurance: () => session?.assurance || null,
    onClear(fn: () => void) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    async factors() {
      const result = await protectedCall('/auth/mfa/prepare', { enroll: false });
      if (!isRecord(result)) throw Error('Authenticator could not be prepared.');
      if (result.enrollmentRequired === true) return [];
      if (result.challengeReady !== true) throw Error('Authenticator could not be prepared.');
      return [{ id: 'server-bound-challenge', status: 'verified' }];
    },
    async enroll() {
      const result = await protectedCall('/auth/mfa/prepare', { enroll: true });
      if (
        !isRecord(result) ||
        result.challengeReady !== true ||
        typeof result.enrollmentSecret !== 'string' ||
        !/^[A-Z2-7]{16,128}$/.test(result.enrollmentSecret)
      )
        throw Error('Authenticator setup could not be verified.');
      return { id: 'server-bound-challenge', totp: { secret: result.enrollmentSecret } };
    },
    async verifyFactor(id: string, code: string) {
      if (id !== 'server-bound-challenge' || !/^\d{6}$/.test(code))
        throw Error('Enter a six-digit authenticator code.');
      let result: unknown;
      try {
        result = await protectedCall('/auth/mfa/complete', { code });
      } catch (error) {
        if (session && ![401, 403].includes(errorStatus(error) ?? 0))
          throw Object.assign(
            Error(
              'Verification was not completed. Wait 30 seconds, then select Open business workspace to try a new code. No access was granted.',
            ),
            { restartMfa: true },
          );
        throw error;
      }
      if (!isRecord(result) || result.assurance !== 'aal2')
        throw Error('Authenticator verification failed.');
      // Re-read authoritative session; never upgrade assurance from browser state.
      if (!(await restore()) || session?.assurance !== 'aal2')
        throw Error('Business verification expired.');
    },
    async workspace() {
      const result = await protectedCall('/api/workspace');
      if (
        !isRecord(result) ||
        typeof result.organization_id !== 'string' ||
        typeof result.brand_name !== 'string' ||
        typeof result.role !== 'string' ||
        result.campaigns_enabled !== false ||
        result.billing_enabled !== false
      )
        throw Error('Business workspace could not be verified.');
      return { brand: result.brand_name, role: result.role };
    },
    async signin(fields: { signup: boolean } & Record<string, unknown> = { signup: false }) {
      const stamp = generation;
      if (session) throw Error('Sign out before starting another sign-in.');
      const result = await call('/auth/start', fields);
      if (stamp !== generation) throw Error('This sign-in is no longer active.');
      if (!isRecord(result) || typeof result.authorizationUrl !== 'string')
        throw Error('Business sign-in destination could not be verified.');
      const destination = new URL(result.authorizationUrl);
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
      if (value !== null && !isBusinessApplication(value))
        throw Error('The application response could not be verified. Please retry.');
      return value;
    },
    async command(body: unknown) {
      const value = await protectedCall('/api/application', body);
      if (!isRecord(value) || !isBusinessApplication(value.application))
        throw Error('The command response could not be verified. Refresh to check its status.');
      return { ...value, application: value.application };
    },
    async signout() {
      const csrf = session?.csrf;
      clear(); // Fence protected data and in-flight work before waiting on network.
      if (!csrf) return;
      const result = await call('/auth/logout', {}, csrf);
      if (!isRecord(result) || result.signedIn !== false || result.remoteConfirmed !== true)
        throw Error('This page is locked. Remote sign-out could not be confirmed.');
    },
  };
}
