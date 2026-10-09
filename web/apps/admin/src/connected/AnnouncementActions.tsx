import { useEffect, useState, useSyncExternalStore } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Alert,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Stack,
  TextField,
} from '@mui/material';
import type { EmployeeSessionController } from '@doji/portal-data/employee';
import type { announcementRecord } from '@doji/portal-data/announcements';

export function AnnouncementActions({
  controller,
  item,
}: {
  controller: EmployeeSessionController;
  item: ReturnType<typeof announcementRecord>;
}) {
  const flow = controller.getAnnouncementFlow();
  const command = useSyncExternalStore(flow.subscribe, flow.getSnapshot);
  const [reason, setReason] = useState('');
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const pending = command.intent;
  const busy = command.phase === 'saving' || command.phase === 'uncertain';
  const cancelling = pending?.p_action === 'cancel' && pending.p_id === item.id;
  const canWrite =
    item.managed &&
    item.canWrite &&
    !!item.version &&
    controller.getSnapshot().operator?.capabilities.operator_manage === true;
  useEffect(() => {
    const guard = (event: BeforeUnloadEvent) => {
      if (busy) event.preventDefault();
    };
    window.addEventListener('beforeunload', guard);
    return () => window.removeEventListener('beforeunload', guard);
  }, [busy]);
  const close = () => {
    if (!busy) {
      setOpen(false);
      flow.dismiss();
    }
  };
  return (
    <Stack spacing={2}>
      {command.message && (
        <Alert severity={command.phase === 'complete' ? 'success' : 'warning'}>
          {command.message}
        </Alert>
      )}
      {pending && !cancelling && (
        <Alert
          severity="warning"
          action={
            <Button
              onClick={() =>
                navigate(
                  pending.p_action === 'cancel'
                    ? '/announcements/' + pending.p_id
                    : pending.p_id
                      ? '/announcements/' + pending.p_id + '/edit'
                      : '/announcements/new',
                )
              }
            >
              Resume pending action
            </Button>
          }
        >
          Another announcement action is pending.
        </Alert>
      )}
      <Stack direction="row" spacing={2}>
        {canWrite && item.state === 'draft' && item.actions.includes('save') && (
          <Button component={Link} to={'/announcements/' + item.id + '/edit'} disabled={!!pending}>
            Edit draft
          </Button>
        )}
        {canWrite && item.actions.includes('cancel') && (
          <Button
            color="error"
            variant="outlined"
            disabled={!!pending}
            onClick={() => {
              flow.dismiss();
              setOpen(true);
            }}
          >
            Cancel announcement
          </Button>
        )}
      </Stack>
      <Dialog
        open={open || cancelling}
        onClose={busy ? undefined : close}
        fullWidth
        maxWidth="sm"
        aria-labelledby="cancel-announcement-title"
      >
        <DialogTitle id="cancel-announcement-title">Cancel announcement?</DialogTitle>
        <DialogContent>
          <Stack spacing={2}>
            <Alert severity="warning">
              Stops future displays. Does not undo views or rewards already earned.
            </Alert>
            {command.message && <Alert severity="warning">{command.message}</Alert>}
            <TextField
              label="Cancellation reason"
              multiline
              minRows={2}
              fullWidth
              value={cancelling ? pending.p_reason : reason}
              disabled={!!pending}
              onChange={(event) => setReason(event.target.value)}
              helperText="8–1,000 characters. Retained in the audit history."
              slotProps={{ htmlInput: { maxLength: 1000 } }}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button disabled={busy} onClick={close}>
            Back
          </Button>
          <Button
            color="error"
            variant="contained"
            disabled={
              command.phase === 'saving' ||
              command.phase === 'rejected' ||
              (!cancelling &&
                (!canWrite ||
                  !item.actions.includes('cancel') ||
                  reason.trim().length < 8 ||
                  reason.trim().length > 1000))
            }
            onClick={() => {
              if (!cancelling)
                flow.prepare({
                  p_action: 'cancel',
                  p_id: item.id,
                  p_version: item.version!,
                  p_reason: reason.trim(),
                  p_request_id: crypto.randomUUID(),
                });
              void flow.submit().then((result) => {
                if (result) {
                  setOpen(false);
                  setReason('');
                }
              });
            }}
          >
            {command.phase === 'uncertain'
              ? 'Retry identical cancellation'
              : command.phase === 'saving'
                ? 'Cancelling…'
                : 'Confirm cancellation'}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
