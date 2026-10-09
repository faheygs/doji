import { useEffect, useRef, useState } from 'react';
import { invalidatePortalAreas } from '@doji/portal-data';
import type { EmployeeSessionController } from '@doji/portal-data/employee';
import type { BusinessRecord } from '@doji/portal-data/business-record';
import type { BusinessOwnership } from '@doji/portal-data/business-claim';

/** One explicit user intent; uncertain retries retain the exact request ID and versions. */
export function useBusinessClaim(controller: EmployeeSessionController, id: string) {
  const scope = useRef<AbortController | null>(null);
  const intent = useRef<BusinessOwnership | null>(null);
  const inFlight = useRef(false);
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
  async function submit(
    data: BusinessRecord,
    action: BusinessOwnership['p_action'] = 'claim',
    target: string | null = null,
  ) {
    const abort = scope.current;
    const session = controller.getSnapshot();
    if (
      !abort ||
      abort.signal.aborted ||
      inFlight.current ||
      !session.session ||
      (!intent.current &&
        (state.blocked ||
          !(action === 'claim'
            ? data.owner.can_claim
            : action === 'release'
              ? data.owner.can_release
              : data.owner.can_assign) ||
          !data.owner.actionable ||
          (action === 'claim' && data.owner.assigned_to !== null) ||
          (action === 'assign' && (!target || target === data.owner.assigned_to))))
    )
      return;
    intent.current ??= Object.freeze({
      p_kind: 'business_application',
      p_id: id,
      p_revision: data.owner.revision,
      p_source_version: data.owner.source_version,
      p_action: action,
      p_target: action === 'assign' ? target : null,
      p_request_id: crypto.randomUUID(),
    });
    inFlight.current = true;
    setState({ busy: true, uncertain: false, blocked: false, message: '' });
    const current = () =>
      !abort.signal.aborted && controller.getSnapshot().session === session.session;
    try {
      await controller.changeBusinessOwnership(intent.current, abort.signal);
      if (!current()) return;
      intent.current = null;
      // Receipt confirms the write; authoritative reads supply the current assignee.
      await invalidatePortalAreas(session.cache!, session.session!, ['work']);
      if (current()) {
        setState({
          busy: false,
          uncertain: false,
          blocked: false,
          message: 'Assignment recorded. Current ownership is shown below.',
        });
        return true;
      }
    } catch (error) {
      if (!current()) return;
      const status = error && typeof error === 'object' && 'status' in error ? error.status : null;
      const rejected = [400, 401, 403, 404, 409, 422].includes(Number(status));
      if (rejected) intent.current = null;
      setState({
        busy: false,
        uncertain: !rejected,
        blocked: rejected,
        message: rejected
          ? 'Assignment was not accepted. Refresh the record to check current ownership and permissions.'
          : 'Assignment could not be confirmed. Retry the same assignment or refresh to check ownership.',
      });
    } finally {
      inFlight.current = false;
    }
  }
  function refreshed(latest: BusinessRecord | undefined) {
    if (inFlight.current) return;
    if (
      state.uncertain &&
      intent.current &&
      (!latest ||
        (latest.owner.revision <= intent.current.p_revision &&
          latest.owner.source_version === intent.current.p_source_version))
    ) {
      setState({
        busy: false,
        uncertain: true,
        blocked: false,
        message:
          'Ownership has not advanced. The earlier outcome is still unconfirmed; retry only the same assignment.',
      });
      return;
    }
    intent.current = null;
    setState({ busy: false, uncertain: false, blocked: false, message: '' });
  }
  return { ...state, submit, refreshed };
}
