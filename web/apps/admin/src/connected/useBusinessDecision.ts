import { useEffect, useRef, useState } from 'react';
import { invalidatePortalAreas } from '@doji/portal-data';
import type { EmployeeSessionController } from '@doji/portal-data/employee';
import { validBusinessDecision, type BusinessDecision } from '@doji/portal-data/business-decision';

export function useBusinessDecision(controller: EmployeeSessionController) {
  const scope = useRef<AbortController | null>(null);
  const running = useRef(false);
  const [intent, setIntent] = useState<BusinessDecision | null>(null);
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
  function prepare(input: Omit<BusinessDecision, 'p_request_id'>) {
    if (running.current || state.uncertain || state.blocked) return;
    const next = Object.freeze({ ...input, p_request_id: crypto.randomUUID() });
    if (!validBusinessDecision(next)) return;
    setIntent(next);
    setState({ busy: false, uncertain: false, blocked: false, message: '' });
  }
  async function submit() {
    const abort = scope.current;
    const session = controller.getSnapshot();
    if (
      !intent ||
      !abort ||
      abort.signal.aborted ||
      running.current ||
      state.blocked ||
      !session.session
    )
      return;
    running.current = true;
    setState({ busy: true, uncertain: false, blocked: false, message: '' });
    const current = () =>
      !abort.signal.aborted && controller.getSnapshot().session === session.session;
    try {
      await controller.decideBusiness(intent, abort.signal);
      if (!current()) return;
      setIntent(null);
      await invalidatePortalAreas(session.cache!, session.session, ['work']);
      if (current()) {
        setState({
          busy: false,
          uncertain: false,
          blocked: false,
          message: 'Decision recorded. The current application status is shown above.',
        });
        return true;
      }
    } catch (error) {
      if (!current()) return;
      const status = error && typeof error === 'object' && 'status' in error ? error.status : null;
      const rejected = [400, 401, 403, 404, 409, 422].includes(Number(status));
      setState({
        busy: false,
        uncertain: !rejected,
        blocked: rejected,
        message: rejected
          ? 'Decision was not accepted. Refresh the record before reviewing again.'
          : 'Decision could not be confirmed. Retry this exact decision or refresh to check the application. Do not submit a different decision yet.',
      });
    } finally {
      running.current = false;
    }
  }
  function reset() {
    if (running.current) return;
    setIntent(null);
    setState({ busy: false, uncertain: false, blocked: false, message: '' });
  }
  return {
    ...state,
    intent,
    prepare,
    submit,
    reset,
    stillUnconfirmed: () => {
      if (!running.current)
        setState({
          busy: false,
          uncertain: true,
          blocked: false,
          message:
            'The refreshed record has not advanced. The earlier outcome is still unconfirmed; only the same decision can be retried.',
        });
    },
    cancel: () => {
      if (!running.current && !state.uncertain) setIntent(null);
    },
  };
}
