import { useState } from 'react';
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
} from '@mui/material';
import { FormActions } from '@doji/ui';
import {
  safetyActions,
  type SafetyInput,
  validSafetyCommand,
} from '@doji/portal-data/safety-command';
import type { SafetyRecord } from '@doji/portal-data/safety-record';
import type { EmployeeSessionController } from '@doji/portal-data/employee';
import type { useSafetyCommand } from './useSafetyCommand';
import { SafetyFields, safetyDraftInput, type SafetyDraft } from './SafetyFields';

export function SafetyOutcome({
  controller,
  item,
  fetching,
  refresh,
  command,
  disabled = false,
}: {
  controller: EmployeeSessionController;
  item: SafetyRecord;
  fetching: boolean;
  refresh: () => Promise<SafetyRecord | undefined>;
  command: ReturnType<typeof useSafetyCommand>;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState<SafetyDraft | null>(null);
  const [confirm, setConfirm] = useState<SafetyInput | null>(null);
  const caps = controller.getSnapshot().operator?.capabilities;
  const allowed = item.canWrite && caps?.moderation_write === true;
  const mine = item.assignedTo === controller.getSnapshot().operator?.user_id;
  const stale = !!draft && draft.revision !== item.revision;
  const locked =
    disabled || command.busy || command.uncertain || command.blocked || fetching || stale;
  const input = draft ? safetyDraftInput(draft, item) : null;
  const valid =
    input &&
    validSafetyCommand({
      p_id: item.id,
      p_revision: item.revision,
      p_command_id: item.id,
      p_input: input,
    });
  const reload = async () => {
    if (command.refreshed(await refresh())) {
      setConfirm(null);
      setDraft(null);
    }
  };
  const apply = async (value: SafetyInput) => {
    if (await command.submit(item, value)) {
      setDraft(null);
      setConfirm(null);
    }
  };
  return (
    <>
      {command.message && (
        <Alert severity={command.uncertain || command.blocked ? 'warning' : 'success'}>
          {command.message}
        </Alert>
      )}
      {stale && (
        <Alert severity="warning">
          This case changed. Refresh before recording a different outcome; your draft has not been
          submitted.
        </Alert>
      )}
      {!allowed ? (
        <Alert severity="info">You have read-only access to this case.</Alert>
      ) : !mine && item.assignedTo ? (
        <Alert severity="info">This case is assigned to another employee.</Alert>
      ) : (
        <>
          {(mine || item.closedAt) && (
            <SafetyFields
              item={item}
              draft={draft}
              setDraft={setDraft}
              disabled={locked || !!confirm}
            />
          )}
          <FormActions>
            <Button disabled={disabled || command.busy || fetching} onClick={() => void reload()}>
              Refresh case
            </Button>
            {command.uncertain && !confirm ? (
              <Button
                variant="contained"
                disabled={command.busy || fetching}
                onClick={() => void apply({ action: 'claim', note: 'Self-assigned for review.' })}
              >
                Retry same action
              </Button>
            ) : !item.assignedTo && !item.closedAt ? (
              <Button
                variant="contained"
                disabled={locked}
                onClick={() => void apply({ action: 'claim', note: 'Self-assigned for review.' })}
              >
                Assign to me
              </Button>
            ) : (
              <Button
                variant="contained"
                disabled={locked || !valid || !!confirm}
                onClick={() => input && setConfirm(input)}
              >
                {draft ? safetyActions[draft.action] : 'Choose an action'}
              </Button>
            )}
          </FormActions>
        </>
      )}
      <Dialog
        open={!!confirm}
        onClose={() => {
          if (!command.busy && !command.uncertain) setConfirm(null);
        }}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>{confirm ? safetyActions[confirm.action] : 'Case outcome'}</DialogTitle>
        <DialogContent>
          <DialogContentText>
            This records the case workflow only. It does not remove content, revoke media access, or
            send an email.
          </DialogContentText>
          {confirm?.message && (
            <DialogContentText sx={{ mt: 2, whiteSpace: 'pre-wrap' }}>
              Requester response: {confirm.message}
            </DialogContentText>
          )}
          {(stale || command.blocked || command.uncertain) && (
            <Alert severity="warning" sx={{ mt: 2 }}>
              {command.message || 'This case changed. Refresh before continuing.'}
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button disabled={command.busy || command.uncertain} onClick={() => setConfirm(null)}>
            Back
          </Button>
          {(command.uncertain || command.blocked || stale) && (
            <Button disabled={command.busy || fetching} onClick={() => void reload()}>
              Refresh case
            </Button>
          )}
          <Button
            variant="contained"
            disabled={
              command.busy ||
              disabled ||
              fetching ||
              command.blocked ||
              (!command.uncertain && stale) ||
              !allowed
            }
            onClick={() => confirm && void apply(confirm)}
          >
            {command.uncertain ? 'Retry same action' : 'Confirm'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
