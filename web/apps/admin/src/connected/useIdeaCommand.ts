import { useEffect, useRef, useState } from 'react';
import { invalidatePortalAreas } from '@doji/portal-data';
import type { EmployeeSessionController } from '@doji/portal-data/employee';
import { validIdeaInput, type IdeaInput } from '@doji/portal-data/idea-command';

export function useIdeaCommand(controller: EmployeeSessionController) {
  const scope = useRef<AbortController | null>(null),
    running = useRef(false);
  const pending = useRef<IdeaInput | null>(null);
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
  async function submit(input?: Omit<IdeaInput, 'key'>) {
    const abort = scope.current,
      session = controller.getSnapshot();
    if (!abort || abort.signal.aborted || running.current || state.blocked || !session.session)
      return;
    if (!pending.current && input)
      pending.current = Object.freeze({ ...input, key: crypto.randomUUID() });
    const intent = pending.current;
    if (!intent || !validIdeaInput(intent)) {
      pending.current = null;
      return;
    }
    const current = () =>
      !abort.signal.aborted && controller.getSnapshot().session === session.session;
    running.current = true;
    setState({ busy: true, uncertain: false, blocked: false, message: '' });
    try {
      await controller.reviewIdea(intent, abort.signal);
      if (!current()) return;
      pending.current = null;
      await invalidatePortalAreas(session.cache!, session.session, ['work', 'audit']);
      if (current()) {
        setCompleted((value) => value + 1);
        setState({
          busy: false,
          uncertain: false,
          blocked: false,
          message: 'Action recorded. Current record requested.',
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
          ? 'Action was not accepted. Refresh the record before continuing.'
          : 'The outcome is unconfirmed. Retry only the identical action; do not submit a different decision.',
      });
    } finally {
      running.current = false;
    }
  }
  return {
    ...state,
    completed,
    submit,
    refreshed: () => {
      if (running.current || pending.current) return false;
      setState({ busy: false, uncertain: false, blocked: false, message: '' });
      return true;
    },
  };
}
