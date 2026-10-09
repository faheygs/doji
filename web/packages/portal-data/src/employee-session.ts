import { createEmployeeBrowserTransport } from '../../../../infra/portal-identity-candidate/employee-browser-transport.mts';
import { createPortalQueryClient, type PortalSession } from './index';
import type { QueryClient } from '@tanstack/react-query';
import { assertEmployeeRead } from './employee-read-policy';
import { createBusinessCommands } from './business-decision';
import { createSafetyCommand } from './safety-command';
import { createEvidenceRead } from './moderation-evidence';
import { createModerationCommand } from './moderation-command';
import { createIdeaCommand } from './idea-command';
import { createEmployeeRoleCommand } from './employee-team';
import { createAnnouncementFlow } from './announcement-flow';

type Config = Parameters<typeof createEmployeeBrowserTransport>[0];
type Options = Parameters<typeof createEmployeeBrowserTransport>[1];
export type EmployeeOperator = Readonly<{
  user_id: string;
  display_name: string;
  capabilities: Readonly<Record<string, boolean>>;
}>;
export type EmployeeSessionState = Readonly<{
  phase: 'restoring' | 'signed-out' | 'mfa' | 'enroll' | 'ready' | 'error' | 'cleanup-error';
  busy: boolean;
  message: string;
  operator: EmployeeOperator | null;
  session: PortalSession | null;
  cache: QueryClient | null;
}>;
const record = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
function operator(value: unknown): EmployeeOperator {
  if (
    !record(value) ||
    typeof value.user_id !== 'string' ||
    !/^[a-f\d]{8}(-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(value.user_id) ||
    !record(value.capabilities) ||
    Object.values(value.capabilities).some((v) => typeof v !== 'boolean')
  )
    throw Error('Employee permissions could not be verified.');
  return Object.freeze({
    user_id: value.user_id,
    display_name:
      typeof value.display_name === 'string' ? value.display_name.slice(0, 160) : 'Employee',
    capabilities: Object.freeze({ ...value.capabilities }) as Readonly<Record<string, boolean>>,
  });
}
const status = (e: unknown) => (record(e) ? e.status : undefined);
const message = (e: unknown) =>
  e instanceof Error ? e.message : 'Employee access could not be completed.';

/** Reuses the deployed employee-only cookie/CSRF transport. No member Auth SDK or persistence. */
export function createEmployeeSession(config: Config, options: Options = {}) {
  let generation = 0;
  let createdAt: number | undefined;
  let expiry: ReturnType<typeof setTimeout> | undefined;
  const clock = options.now ?? Date.now;
  let state: EmployeeSessionState = {
    phase: 'restoring',
    busy: false,
    message: '',
    operator: null,
    session: null,
    cache: null,
  };
  let restoreTask: Promise<void> | null = null;
  let announcementFlow: ReturnType<typeof createAnnouncementFlow> | null = null;
  const listeners = new Set<() => void>();
  const publish = (patch: Partial<EmployeeSessionState>) => {
    state = { ...state, ...patch };
    listeners.forEach((fn) => fn());
  };
  function clear(phase: EmployeeSessionState['phase'], text: string) {
    announcementFlow?.dispose();
    announcementFlow = null;
    generation++;
    clearTimeout(expiry);
    createdAt = undefined;
    const cache = state.cache;
    // Cancelling queries fences cache installation. Transport separately fences queued work.
    void cache?.cancelQueries();
    cache?.clear();
    publish({ phase, busy: false, message: text, operator: null, session: null, cache: null });
  }
  const transport = createEmployeeBrowserTransport(
    {
      ...config,
      onAccessInvalidated: (text) => clear('signed-out', text),
      onSessionCleanupFailed: (text) => clear('cleanup-error', text),
    },
    options,
  );
  const current = (stamp: number) => {
    if (stamp !== generation) throw Error('Employee session changed.');
  };
  function scheduleExpiry() {
    if (createdAt === undefined) createdAt = clock();
    clearTimeout(expiry);
    expiry = setTimeout(
      () => {
        clear('signed-out', 'Your employee session expired. Sign in again.');
        transport.clearSession();
      },
      Math.max(0, Math.min(30 * 60_000, createdAt + 8 * 3600_000 - clock())),
    );
  }
  function install(value: unknown, stamp: number) {
    current(stamp);
    const next = operator(value);
    const same =
      state.operator?.user_id === next.user_id &&
      JSON.stringify(state.operator.capabilities) === JSON.stringify(next.capabilities);
    if (!same) {
      announcementFlow?.dispose();
      announcementFlow = null;
      void state.cache?.cancelQueries();
      state.cache?.clear();
      generation++;
    }
    publish({
      phase: 'ready',
      busy: false,
      message: '',
      operator: next,
      session: same
        ? state.session
        : { realm: 'employee', subject: next.user_id, epoch: String(generation) },
      cache: same ? state.cache : createPortalQueryClient(),
    });
    scheduleExpiry();
  }
  async function restore() {
    if (restoreTask) return restoreTask;
    if (state.busy || ['mfa', 'enroll', 'cleanup-error'].includes(state.phase)) return;
    if (state.phase === 'ready' && !transport.hasSession()) return signOut();
    const stamp = generation;
    publish({ busy: true, message: '' });
    restoreTask = (async () => {
      try {
        install(await transport.session(), stamp);
      } catch (error) {
        if (stamp === generation) {
          clear(
            status(error) === 401 ? 'signed-out' : 'error',
            status(error) === 401 ? '' : message(error),
          );
          transport.clearSession();
        }
      } finally {
        restoreTask = null;
      }
    })();
    return restoreTask;
  }
  async function signIn(email: string, password: string) {
    if (state.busy || state.phase !== 'signed-out') return;
    const stamp = generation;
    publish({ busy: true, message: '' });
    try {
      const step = await transport.signIn(email, password);
      current(stamp);
      publish({ phase: 'requiresEnrollment' in step ? 'enroll' : 'mfa', busy: false });
    } catch (error) {
      if (stamp === generation) publish({ busy: false, message: message(error) });
    }
  }
  async function verify(code: string) {
    if (state.busy || !['mfa', 'enroll'].includes(state.phase)) return;
    const stamp = generation;
    publish({ busy: true, message: '' });
    try {
      install((await transport.verifyPendingChallenge(code)).operator, stamp);
    } catch (error) {
      if (stamp === generation) publish({ busy: false, message: message(error) });
    }
  }
  async function signOut() {
    clear('signed-out', '');
    const stamp = generation;
    publish({ busy: true });
    try {
      await transport.signOut();
    } catch {
      if (stamp === generation)
        publish({
          phase: 'cleanup-error',
          message:
            'Locked locally; server sign-out could not be confirmed. Retry sign-out before continuing.',
        });
    } finally {
      if (stamp === generation) publish({ busy: false });
    }
  }
  return Object.freeze({
    announcementWritesEnabled: config.announcementComposeEnabled === true,
    getAnnouncementFlow() {
      if (config.announcementComposeEnabled !== true || state.phase !== 'ready' || !state.session)
        throw Error('Announcement composition is unavailable.');
      if (!announcementFlow)
        announcementFlow = createAnnouncementFlow(
          state,
          () => state,
          async (input, signal) => {
            const captured = state.session;
            const { createAnnouncementCommand } = await import('./announcement-command');
            if (!captured || state.session !== captured) throw Error('Employee session changed.');
            return createAnnouncementCommand({
              state: () => state,
              transport,
              restore,
              signOut,
              touch: scheduleExpiry,
            })(input, signal);
          },
        );
      return announcementFlow;
    },
    getSnapshot: () => state,
    subscribe(fn: () => void) {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    restore,
    signIn,
    verify,
    signOut,
    async enrollment() {
      const stamp = generation;
      const value = await transport.enrollTotp();
      current(stamp);
      return value;
    },
    async read<T>(
      capability: string,
      path: string,
      body: Record<string, unknown> | undefined,
      parse: (v: unknown) => T,
      signal: AbortSignal,
    ) {
      assertEmployeeRead(path, body !== undefined);
      const stamp = generation;
      if (state.phase !== 'ready' || state.operator?.capabilities[capability] !== true)
        throw Error('Employee permission required.');
      signal.throwIfAborted();
      if (!transport.hasSession()) {
        clear('signed-out', 'Your employee session expired. Sign in again.');
        transport.clearSession();
        throw Error('Employee session expired.');
      }
      const value = await transport
        .request(path, body === undefined ? {} : { method: 'POST', body })
        .catch(async (error) => {
          // A denied record may also reveal revoked capabilities; never retry the read.
          if (status(error) === 403 && stamp === generation) await restore();
          throw error;
        });
      current(stamp);
      signal.throwIfAborted();
      transport.assertSessionFresh();
      scheduleExpiry();
      return parse(value);
    },
    isFresh: () => transport.hasSession(),
    async createSafetyReport(
      input: import('./safety-report').SafetyReportInput,
      queue: import('./safety-record').SafetyQueue,
      signal: AbortSignal,
    ) {
      const captured = state.session;
      const { createSafetyReport } = await import('./safety-report');
      if (!captured || state.session !== captured) throw Error('Employee session changed.');
      return createSafetyReport({
        state: () => state,
        transport,
        restore,
        signOut,
        touch: scheduleExpiry,
      })(input, queue, signal);
    },
    async createPrivacy(input: import('./privacy-create').PrivacyCreateInput, signal: AbortSignal) {
      const captured = state.session;
      const { createPrivacyRequest } = await import('./privacy-create');
      if (!captured || state.session !== captured) throw Error('Employee session changed.');
      return createPrivacyRequest({
        state: () => state,
        transport,
        restore,
        signOut,
        touch: scheduleExpiry,
      })(input, signal);
    },
    async changePrivacy(input: import('./privacy-command').PrivacyInput, signal: AbortSignal) {
      const captured = state.session;
      const { createPrivacyCommand } = await import('./privacy-command');
      if (!captured || state.session !== captured) throw Error('Employee session changed.');
      return createPrivacyCommand({
        state: () => state,
        transport,
        restore,
        signOut,
        touch: scheduleExpiry,
      })(input, signal);
    },
    changeEmployeeRole: createEmployeeRoleCommand({
      state: () => state,
      transport,
      restore,
      signOut,
      touch: scheduleExpiry,
    }),
    reviewIdea: createIdeaCommand({
      state: () => state,
      transport,
      restore,
      signOut,
      touch: scheduleExpiry,
    }),
    readEvidence: createEvidenceRead({
      state: () => state,
      transport,
      restore,
      signOut,
      touch: scheduleExpiry,
    }),
    moderate: createModerationCommand({
      state: () => state,
      transport,
      restore,
      signOut,
      touch: scheduleExpiry,
    }),
    changeSafety: createSafetyCommand({
      state: () => state,
      transport,
      restore,
      signOut,
      touch: scheduleExpiry,
    }),
    ...createBusinessCommands({
      state: () => state,
      transport,
      restore,
      signOut,
      touch: scheduleExpiry,
    }),
  });
}
export type EmployeeSessionController = ReturnType<typeof createEmployeeSession>;
