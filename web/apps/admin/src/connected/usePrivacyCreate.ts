import { useEffect, useRef, useState } from 'react';
import { invalidatePortalAreas } from '@doji/portal-data';
import type { EmployeeSessionController } from '@doji/portal-data/employee';
import { validPrivacyCreate, type PrivacyCreateInput } from '@doji/portal-data/privacy-create';
export function usePrivacyCreate(controller: EmployeeSessionController) {
  const scope = useRef<AbortController | null>(null),
    running = useRef(false),
    pending = useRef<PrivacyCreateInput | null>(null);
  const [state, setState] = useState({
    busy: false,
    uncertain: false,
    rejected: false,
    message: '',
    id: '',
  });
  useEffect(() => {
    const abort = new AbortController();
    scope.current = abort;
    return () => abort.abort();
  }, [controller]);
  async function submit(input?: Omit<PrivacyCreateInput, 'key'>) {
    const abort = scope.current,
      session = controller.getSnapshot();
    if (!abort || abort.signal.aborted || running.current || state.id || !session.session) return;
    if (!pending.current && input)
      pending.current = Object.freeze({ ...input, key: crypto.randomUUID() });
    const intent = pending.current;
    if (!intent || !validPrivacyCreate(intent)) {
      pending.current = null;
      return;
    }
    const current = () =>
      !abort.signal.aborted && controller.getSnapshot().session === session.session;
    running.current = true;
    setState({ busy: true, uncertain: false, rejected: false, message: '', id: '' });
    try {
      const id = await controller.createPrivacy(intent, abort.signal);
      if (!current()) return;
      pending.current = null;
      setState({
        busy: false,
        uncertain: false,
        rejected: false,
        message: 'Request recorded. No email was sent.',
        id,
      });
      await invalidatePortalAreas(session.cache!, session.session, ['work', 'audit']).catch(
        () => {},
      );
      return current() ? id : undefined;
    } catch (error) {
      if (!current()) return;
      const status =
        error && typeof error === 'object' && 'status' in error ? Number(error.status) : 0;
      const rejected = [400, 401, 403, 404, 409, 422].includes(status);
      if (rejected) pending.current = null;
      setState({
        busy: false,
        uncertain: !rejected,
        rejected,
        id: '',
        message: rejected
          ? 'Request was not accepted. Recheck the verified account and entered information before confirming again.'
          : 'Creation is unconfirmed. Retry this exact request; do not create another case.',
      });
    } finally {
      running.current = false;
    }
  }
  return { ...state, submit };
}
