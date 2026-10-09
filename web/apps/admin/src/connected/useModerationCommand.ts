import { useEffect, useRef, useState } from 'react';
import { invalidatePortalAreas } from '@doji/portal-data';
import type { EmployeeSessionController } from '@doji/portal-data/employee';
import { validModerationInput, type ModerationInput } from '@doji/portal-data/moderation-command';

export function useModerationCommand(controller: EmployeeSessionController) {
  const scope = useRef<AbortController | null>(null),
    running = useRef(false);
  const pending = useRef<ModerationInput | null>(null);
  const [completed, setCompleted] = useState(0);
  const [state, setState] = useState({
    busy: false,
    uncertain: false,
    blocked: false,
    message: '',
  });
  useEffect(() => {
    const abort = new AbortController();
    scope.current = abort;
    return () => abort.abort();
  }, [controller]);
  async function submit(input?: Omit<ModerationInput, 'key'>) {
    const abort = scope.current,
      session = controller.getSnapshot();
    if (!abort || abort.signal.aborted || running.current || state.blocked || !session.session)
      return;
    if (!pending.current && input)
      pending.current = Object.freeze({ ...input, key: crypto.randomUUID() });
    const intent = pending.current;
    if (!intent || !validModerationInput(intent)) {
      pending.current = null;
      return;
    }
    const current = () =>
      !abort.signal.aborted && controller.getSnapshot().session === session.session;
    running.current = true;
    setState({ busy: true, uncertain: false, blocked: false, message: '' });
    try {
      await controller.moderate(intent, abort.signal);
      if (!current()) return;
      pending.current = null;
      await invalidatePortalAreas(session.cache!, session.session, [
        'work',
        'safety',
        'audit',
      ]).catch(() => {});
      if (current()) {
        setCompleted((value) => value + 1);
        setState({
          busy: false,
          uncertain: false,
          blocked: false,
          message: 'Action recorded. Current case data has been requested.',
        });
        return true;
      }
    } catch (error) {
      if (!current()) return;
      const status =
        error && typeof error === 'object' && 'status' in error ? Number(error.status) : 0;
      const rejected = [400, 401, 403, 404, 409, 422].includes(status);
      if (rejected) pending.current = null;
      setState({
        busy: false,
        uncertain: !rejected,
        blocked: rejected,
        message: rejected
          ? 'Action was not accepted. Refresh the case before continuing.'
          : 'The outcome is unconfirmed. Only the identical action can be retried; do not submit a different decision.',
      });
    } finally {
      running.current = false;
    }
  }
  return {
    completed,
    ...state,
    submit,
    refreshed: () => {
      // These legacy commands have no expected revision. A changed read is not proof of receipt.
      if (running.current || pending.current) return false;
      setState({ busy: false, uncertain: false, blocked: false, message: '' });
      return true;
    },
  };
}
