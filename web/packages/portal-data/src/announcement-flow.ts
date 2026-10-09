import { invalidatePortalAreas } from './index';
import type { EmployeeSessionState } from './employee-session';
import {
  freezeAnnouncementCommand,
  type AnnouncementCommand,
} from './announcement-command-contract';

type Outcome = { id: string; action: AnnouncementCommand['p_action'] };
type State = Readonly<{
  intent: AnnouncementCommand | null;
  phase: 'idle' | 'review' | 'saving' | 'uncertain' | 'rejected' | 'complete';
  message: string;
  outcome: Outcome | null;
}>;
/** Session-owned, memory-only intent survives route changes; never auto-retries. */
export function createAnnouncementFlow(
  session: EmployeeSessionState,
  current: () => EmployeeSessionState,
  execute: (input: AnnouncementCommand, signal: AbortSignal) => Promise<Outcome>,
) {
  let state: State = { intent: null, phase: 'idle', message: '', outcome: null };
  const listeners = new Set<() => void>();
  const scope = new AbortController();
  const guard = (event: BeforeUnloadEvent) => {
    if (['saving', 'uncertain'].includes(state.phase)) event.preventDefault();
  };
  if (typeof window !== 'undefined') window.addEventListener('beforeunload', guard);
  const fresh = () => !scope.signal.aborted && current().session === session.session;
  const publish = (next: State) => {
    state = next;
    listeners.forEach((fn) => fn());
  };
  return {
    getSnapshot: () => state,
    subscribe(fn: () => void) {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    dispose() {
      if (typeof window !== 'undefined') window.removeEventListener('beforeunload', guard);
      scope.abort();
      publish({ intent: null, phase: 'idle', message: '', outcome: null });
    },
    prepare(input: AnnouncementCommand) {
      if (!fresh() || !['idle', 'review', 'complete'].includes(state.phase)) return;
      publish({
        intent: freezeAnnouncementCommand(input),
        phase: 'review',
        message: '',
        outcome: null,
      });
    },
    dismiss() {
      if (fresh() && ['review', 'complete', 'rejected'].includes(state.phase))
        publish({ intent: null, phase: 'idle', message: '', outcome: null });
    },
    async submit() {
      if (!fresh() || !state.intent || !['review', 'uncertain'].includes(state.phase)) return;
      const intent = state.intent;
      publish({ ...state, phase: 'saving', message: '' });
      try {
        const outcome = await execute(intent, scope.signal);
        if (!fresh()) return;
        publish({
          intent: null,
          phase: 'complete',
          outcome,
          message:
            'Action recorded. Refreshing current status; this does not confirm member delivery.',
        });
        if (session.cache && session.session)
          await invalidatePortalAreas(session.cache, session.session, [
            'announcements',
            'audit',
          ]).catch(() => {});
        if (fresh()) return outcome;
      } catch (error) {
        if (!fresh()) return;
        const status =
          error && typeof error === 'object' && 'status' in error ? Number(error.status) : 0;
        const rejected = [400, 401, 403, 404, 409, 422].includes(status);
        publish({
          intent,
          outcome: null,
          phase: rejected ? 'rejected' : 'uncertain',
          message: rejected
            ? 'Action was not accepted. Return to the record and refresh before trying again.'
            : 'Outcome unconfirmed. Retry only this identical action. Do not create another announcement.',
        });
      }
    },
  };
}
