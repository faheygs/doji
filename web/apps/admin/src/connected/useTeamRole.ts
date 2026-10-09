import { useEffect, useRef, useState } from 'react';
import { invalidatePortalAreas } from '@doji/portal-data';
import type { EmployeeSessionController } from '@doji/portal-data/employee';
import type { EmployeeRoleInput } from '@doji/portal-data/employee-team';

export function useTeamRole(controller: EmployeeSessionController) {
  const scope = useRef<AbortController | null>(null),
    running = useRef(false);
  const intent = useRef<EmployeeRoleInput | null>(null);
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
  async function submit(input?: Omit<EmployeeRoleInput, 'idempotencyKey'>) {
    const abort = scope.current,
      captured = controller.getSnapshot();
    if (!abort || abort.signal.aborted || running.current || state.blocked || !captured.session)
      return;
    if (!intent.current && input)
      intent.current = Object.freeze({ ...input, idempotencyKey: crypto.randomUUID() });
    if (!intent.current) return;
    const current = () =>
      !abort.signal.aborted && controller.getSnapshot().session === captured.session;
    running.current = true;
    setState({ busy: true, uncertain: false, blocked: false, message: '' });
    try {
      await controller.changeEmployeeRole(intent.current, abort.signal);
      if (!current()) return;
      intent.current = null;
      setState({
        busy: false,
        uncertain: false,
        blocked: false,
        message: 'Access change recorded. Refreshing current permissions and directory.',
      });
      // A self-change can remove this screen's permission. Never keep the old cache.
      await controller.restore();
      if (current())
        await invalidatePortalAreas(captured.cache!, captured.session, ['team', 'audit', 'work']);
      return true;
    } catch (error) {
      if (!current()) return;
      const status =
        error && typeof error === 'object' && 'status' in error ? Number(error.status) : 0;
      const rejected = [400, 401, 403, 404, 409, 422].includes(status);
      if (rejected) intent.current = null;
      setState({
        busy: false,
        uncertain: !rejected,
        blocked: rejected,
        message: rejected
          ? 'Access change was not accepted. Refresh the directory before continuing.'
          : 'Outcome unconfirmed. Retry only the identical access change; do not submit another change.',
      });
    } finally {
      running.current = false;
    }
  }
  return {
    ...state,
    submit,
    refreshed: () => {
      if (running.current || intent.current) return false;
      setState({ busy: false, uncertain: false, blocked: false, message: '' });
      return true;
    },
  };
}
