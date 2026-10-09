import { useEffect, useRef, useState } from 'react';
import { invalidatePortalAreas } from '@doji/portal-data';
import type { EmployeeSessionController } from '@doji/portal-data/employee';
import type { SafetyCommand, SafetyInput } from '@doji/portal-data/safety-command';
import type { SafetyRecord } from '@doji/portal-data/safety-record';

/** A timed-out command retains its exact immutable payload and idempotency key. */
export function useSafetyCommand(controller: EmployeeSessionController, id: string) {
  const scope = useRef<AbortController | null>(null);
  const intent = useRef<SafetyCommand | null>(null);
  const running = useRef(false);
  const [state, setState] = useState({
    busy: false,
    uncertain: false,
    blocked: false,
    message: '',
  });
  useEffect(() => {
    const abort = new AbortController();
    scope.current = abort;
    return () => {
      abort.abort();
      intent.current = null;
    };
  }, [controller, id]);
  async function submit(item: SafetyRecord, input: SafetyInput) {
    const abort = scope.current,
      session = controller.getSnapshot();
    if (
      !abort ||
      abort.signal.aborted ||
      running.current ||
      state.blocked ||
      !session.session ||
      !item.canWrite
    )
      return;
    intent.current ??= Object.freeze({
      p_id: id,
      p_revision: item.revision,
      p_command_id: crypto.randomUUID(),
      p_input: Object.freeze({ ...input }),
    });
    const current = () =>
      !abort.signal.aborted && controller.getSnapshot().session === session.session;
    running.current = true;
    setState({ busy: true, uncertain: false, blocked: false, message: '' });
    try {
      await controller.changeSafety(intent.current, item.queue, abort.signal);
      if (!current()) return;
      intent.current = null;
      await invalidatePortalAreas(session.cache!, session.session, ['work', 'safety']);
      if (current()) {
        setState({
          busy: false,
          uncertain: false,
          blocked: false,
          message: 'Saved. The current case is shown above.',
        });
        return true;
      }
    } catch (error) {
      if (!current()) return;
      const status =
        error && typeof error === 'object' && 'status' in error ? Number(error.status) : null;
      const rejected = status !== null && [400, 401, 403, 404, 409, 422].includes(status);
      if (rejected) intent.current = null;
      setState({
        busy: false,
        uncertain: !rejected,
        blocked: rejected,
        message: rejected
          ? 'This action was not accepted. Refresh the case before continuing.'
          : 'The outcome is unconfirmed. Retry only the same action, or refresh to check the case.',
      });
    } finally {
      running.current = false;
    }
  }
  function refreshed(item: SafetyRecord | undefined) {
    if (running.current) return false;
    if (!item || (intent.current && item.revision <= intent.current.p_revision)) return false;
    intent.current = null;
    setState({ busy: false, uncertain: false, blocked: false, message: '' });
    return true;
  }
  return { ...state, submit, refreshed };
}
