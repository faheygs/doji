import { useEffect, useRef, useState } from 'react';
import { invalidatePortalAreas } from '@doji/portal-data';
import type { EmployeeSessionController } from '@doji/portal-data/employee';
import type { SafetyReportInput } from '@doji/portal-data/safety-report';
import type { SafetyRecord, SafetyQueue } from '@doji/portal-data/safety-record';
import { readSafetyTarget, type SafetyTarget } from '@doji/portal-data/safety-target';
export function useSafetyReport(controller: EmployeeSessionController, id: string) {
  const scope = useRef<AbortController | null>(null),
    running = useRef(false);
  const pending = useRef<{ input: SafetyReportInput; queue: SafetyQueue } | null>(null);
  const [state, setState] = useState({
    busy: false,
    uncertain: false,
    blocked: false,
    message: '',
  });
  const [generation, setGeneration] = useState(0);
  useEffect(() => {
    const abort = new AbortController();
    scope.current = abort;
    return () => {
      abort.abort();
      pending.current = null;
    };
  }, [controller, id]);
  async function submit(prepared?: {
    item: SafetyRecord;
    target: SafetyTarget;
    note: string;
    refresh(): Promise<SafetyRecord | undefined>;
  }) {
    const abort = scope.current,
      session = controller.getSnapshot();
    if (!pending.current && !prepared) return;
    if (!abort || abort.signal.aborted || running.current || state.blocked || !session.session)
      return;
    const current = () =>
      !abort.signal.aborted && controller.getSnapshot().session === session.session;
    running.current = true;
    setState({ busy: true, uncertain: false, blocked: false, message: '' });
    try {
      if (!pending.current) {
        if (!prepared) return;
        const { item, target, note } = prepared,
          fresh = await prepared.refresh();
        if (!current()) return;
        if (
          !fresh ||
          fresh.id !== id ||
          fresh.revision !== item.revision ||
          fresh.queue !== item.queue ||
          fresh.reportId ||
          fresh.closedAt ||
          !fresh.canWrite ||
          fresh.assignedTo !== session.operator?.user_id
        )
          throw Error('Case changed');
        const checked = await readSafetyTarget(
          controller,
          fresh,
          target.kind,
          target.id,
          abort.signal,
        );
        if (!current()) return;
        if (checked.fingerprint !== target.fingerprint) throw Error('Content changed');
        pending.current = {
          queue: item.queue,
          input: Object.freeze({
            p_id: id,
            p_revision: item.revision,
            p_command_id: crypto.randomUUID(),
            p_input: Object.freeze({
              kind: target.kind,
              target_id: target.id,
              fingerprint: target.fingerprint,
              note: note.trim(),
            }),
          }),
        };
      }
      await controller.createSafetyReport(
        pending.current.input,
        pending.current.queue,
        abort.signal,
      );
      if (!current()) return;
      pending.current = null;
      await invalidatePortalAreas(session.cache!, session.session, [
        'work',
        'safety',
        'audit',
      ]).catch(() => {});
      if (current()) {
        setGeneration((value) => value + 1);
        setState({
          busy: false,
          uncertain: false,
          blocked: false,
          message: 'Report created and linked. Current case data has been requested.',
        });
      }
    } catch (error) {
      if (!current()) return;
      const status =
        error && typeof error === 'object' && 'status' in error ? Number(error.status) : 0;
      const rejected = [400, 401, 403, 404, 409, 422].includes(status);
      const sent = !!pending.current;
      if (rejected) pending.current = null;
      setState({
        busy: false,
        uncertain: sent && !rejected,
        blocked: !sent || rejected,
        message:
          sent && !rejected
            ? 'Report creation is unconfirmed. Retry only the identical report.'
            : 'Report was not created or accepted. Refresh and inspect the exact content again.',
      });
    } finally {
      running.current = false;
    }
  }
  return {
    ...state,
    generation,
    submit,
    reset: () => {
      if (running.current || pending.current) return;
      setGeneration((value) => value + 1);
      setState({ busy: false, uncertain: false, blocked: false, message: '' });
    },
  };
}
