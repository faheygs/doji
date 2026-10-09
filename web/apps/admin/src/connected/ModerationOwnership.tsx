import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Typography,
} from '@mui/material';
import type { EmployeeSessionController } from '@doji/portal-data/employee';
import type { ModerationRecord } from '@doji/portal-data/moderation-record';
import { caseFingerprint } from './ModerationFields';
import { BusinessAssigneePicker } from './BusinessAssigneePicker';
import type { useModerationCommand } from './useModerationCommand';
export function ModerationOwnership({
  controller,
  item,
  disabled,
  refresh,
  command,
  onBusy,
}: {
  controller: EmployeeSessionController;
  item: ModerationRecord;
  disabled: boolean;
  refresh(): Promise<ModerationRecord | undefined>;
  command: ReturnType<typeof useModerationCommand>;
  onBusy(busy: boolean): void;
}) {
  const [snapshot, setSnapshot] = useState<ModerationRecord | null>(null);
  const [target, setTarget] = useState(''),
    [message, setMessage] = useState('');
  const running = useRef(false),
    scope = useRef<AbortController | null>(null);
  useEffect(() => {
    const abort = new AbortController();
    scope.current = abort;
    return () => abort.abort();
  }, []);
  const actor = controller.getSnapshot().operator!;
  // An unassigned appeal must never inherit its linked report's owner.
  const owner = item.appeal ? item.owner?.assigned_to : item.report.assignedTo;
  const open = (item.appeal?.appeal.status ?? item.report.summary.status) === 'pending';
  const claim = open && !owner && (!item.appeal || item.owner?.can_claim);
  const release =
    open &&
    (item.appeal
      ? item.owner?.can_release && (owner === actor.user_id || actor.capabilities.operator_manage)
      : owner === actor.user_id);
  const assign =
    open && !!item.appeal && item.owner?.can_assign && actor.capabilities.operator_manage;
  const stale = !!snapshot && caseFingerprint(snapshot) !== caseFingerprint(item);
  async function submit(action: 'claim' | 'release' | 'assign') {
    if (disabled || running.current || (action === 'assign' && (!snapshot || !target || stale)))
      return;
    const captured = snapshot ?? item,
      selected = target;
    const session = controller.getSnapshot().session,
      abort = scope.current;
    if (!abort || abort.signal.aborted) return;
    running.current = true;
    onBusy(true);
    setMessage('');
    try {
      const fresh = await refresh();
      if (abort.signal.aborted || controller.getSnapshot().session !== session) return;
      if (!fresh || caseFingerprint(fresh) !== caseFingerprint(captured)) {
        setMessage('Ownership or case changed. Refresh before assigning.');
        return;
      }
      setSnapshot(null);
      await command.submit(
        fresh.appeal
          ? {
              kind: 'ownership',
              id: fresh.appeal.id,
              action,
              restricted: fresh.restricted,
              revision: fresh.owner!.revision,
              sourceVersion: fresh.owner!.source_version,
              ...(action === 'assign' ? { target: selected } : {}),
            }
          : { kind: 'triage', id: fresh.report.id, action, restricted: fresh.restricted },
      );
    } catch {
      if (!abort.signal.aborted && controller.getSnapshot().session === session)
        setMessage('Ownership could not be reverified. Refresh before assigning.');
    } finally {
      running.current = false;
      if (!abort.signal.aborted) onBusy(false);
    }
  }
  return (
    <>
      {message && !snapshot && <Alert severity="warning">{message}</Alert>}
      {claim && (
        <Button variant="contained" disabled={disabled} onClick={() => void submit('claim')}>
          Start review
        </Button>
      )}
      {release && (
        <Button disabled={disabled} onClick={() => void submit('release')}>
          Release assignment
        </Button>
      )}
      {assign && (
        <Button
          disabled={disabled}
          onClick={() => {
            setTarget('');
            setMessage('');
            setSnapshot(item);
          }}
        >
          Change assignee
        </Button>
      )}
      <Dialog
        open={!!snapshot}
        fullWidth
        maxWidth="sm"
        aria-labelledby="moderation-assignment-title"
        onClose={() => {
          if (!running.current) setSnapshot(null);
        }}
      >
        <DialogTitle id="moderation-assignment-title">Change assignee</DialogTitle>
        <DialogContent>
          <Stack sx={{ gap: 2, pt: 1 }}>
            <Typography>
              Assign this appeal to an eligible reviewer. This does not decide the appeal or notify
              the member.
            </Typography>
            {(stale || message) && (
              <Alert severity="warning">
                {message || 'Ownership or case changed. Cancel and refresh.'}
              </Alert>
            )}
            {snapshot?.appeal && (
              <BusinessAssigneePicker
                controller={controller}
                kind="appeal"
                id={snapshot.appeal.id}
                owner={snapshot.owner!.assigned_to}
                selected={target}
                select={setTarget}
                disabled={disabled || stale || !!message}
              />
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button disabled={running.current} onClick={() => setSnapshot(null)}>
            Cancel
          </Button>
          <Button
            variant="contained"
            disabled={disabled || stale || !!message || !target || target === owner}
            onClick={() => void submit('assign')}
          >
            Assign reviewer
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
