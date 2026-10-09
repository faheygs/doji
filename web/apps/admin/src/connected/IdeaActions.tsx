import { useState } from 'react';
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { FormActions, RecordSection } from '@doji/ui';
import type { IdeaRecord, IdeaAction } from '@doji/portal-data/idea-record';
import type { EmployeeOperator } from '@doji/portal-data/employee';
import type { useIdeaCommand } from './useIdeaCommand';
import type { EmployeeSessionController } from '@doji/portal-data/employee';
import { IdeaAssignment } from './IdeaAssignment';

export function IdeaActions({
  data,
  controller,
  operator,
  fetching,
  command,
  refresh,
}: {
  data: IdeaRecord;
  controller: EmployeeSessionController;
  operator: EmployeeOperator;
  fetching: boolean;
  command: ReturnType<typeof useIdeaCommand>;
  refresh(): Promise<IdeaRecord | undefined>;
}) {
  const [action, setAction] = useState<IdeaAction | ''>('');
  const [reason, setReason] = useState('');
  const [confirmation, setConfirmation] = useState<{
    version: string;
    revision: number;
    assignee: string | null;
    action: IdeaAction;
    reason: string;
  } | null>(null);
  const [checking, setChecking] = useState(false),
    [message, setMessage] = useState('');
  const { idea, owner } = data;
  const fingerprint = `${idea.version}:${owner.revision}:${owner.assignedTo}`;
  const [draftFingerprint, setDraftFingerprint] = useState(fingerprint);
  const stale = draftFingerprint !== fingerprint;
  const disabled =
    command.busy || command.uncertain || command.blocked || fetching || checking || stale;
  // Closed ideas retain the server's retriage policy. Active ideas must be claimed first.
  const mayDecide =
    operator.capabilities.operator_manage &&
    idea.canWrite &&
    !idea.blocked &&
    (idea.status !== 'pending' || (owner.canDecide && owner.assignedTo === operator.user_id));
  const choices = idea.actions.filter((value) => value !== 'approved' || idea.supported);
  const label = (value: string) =>
    value === 'approved'
      ? 'Accept into pool'
      : value === 'pending'
        ? 'Reopen for review'
        : idea.status === 'approved'
          ? 'Reverse acceptance'
          : 'Decline idea';
  const sendOwnership = (value: 'claim' | 'release') =>
    void command.submit({
      id: idea.id,
      action: value,
      revision: owner.revision,
      version: idea.version,
      reason: '',
    });
  const confirm = async () => {
    if (!confirmation || disabled) return;
    setChecking(true);
    setMessage('');
    try {
      const fresh = await refresh();
      if (
        !fresh ||
        fresh.idea.version !== confirmation.version ||
        fresh.owner.revision !== confirmation.revision ||
        fresh.owner.assignedTo !== confirmation.assignee ||
        !fresh.idea.canWrite ||
        fresh.idea.blocked ||
        !fresh.idea.actions.includes(confirmation.action) ||
        (confirmation.action === 'approved' && !fresh.idea.supported) ||
        (fresh.idea.status === 'pending' &&
          (!fresh.owner.canDecide || fresh.owner.assignedTo !== operator.user_id))
      ) {
        setConfirmation(null);
        setMessage('The record changed. Review the current details before deciding.');
        return;
      }
      setConfirmation(null);
      await command.submit({
        id: idea.id,
        action: confirmation.action,
        reason: confirmation.reason,
        version: confirmation.version,
        revision: confirmation.revision,
      });
    } finally {
      setChecking(false);
    }
  };
  return (
    <>
      {message && !stale && <Alert severity="warning">{message}</Alert>}
      {stale && !command.uncertain && (
        <Alert severity="warning">
          The record changed. Reload the review form before deciding.
          <Button
            disabled={command.busy || fetching || checking}
            onClick={() => {
              setAction('');
              setReason('');
              setConfirmation(null);
              setDraftFingerprint(fingerprint);
            }}
          >
            Reload review form
          </Button>
        </Alert>
      )}
      {mayDecide && choices.length > 0 && (
        <RecordSection title="Review outcome">
          <Stack sx={{ gap: 2 }}>
            <TextField
              select
              fullWidth
              label="Outcome"
              value={action}
              disabled={disabled}
              onChange={(event) => setAction(event.target.value as IdeaAction)}
            >
              {choices.map((value) => (
                <MenuItem key={value} value={value}>
                  {label(value)}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              fullWidth
              multiline
              minRows={3}
              label="Response to member"
              value={reason}
              disabled={disabled}
              helperText="Explain your decision. This response is visible to the submitting member."
              slotProps={{ htmlInput: { maxLength: 1000 } }}
              onChange={(event) => setReason(event.target.value)}
            />
          </Stack>
        </RecordSection>
      )}
      <FormActions>
        {command.uncertain ? (
          <Button variant="contained" disabled={command.busy} onClick={() => void command.submit()}>
            Retry identical action
          </Button>
        ) : (
          <>
            {command.blocked && (
              <Button
                disabled={checking}
                onClick={() =>
                  void refresh().then((value) => {
                    if (value) command.refreshed();
                  })
                }
              >
                Refresh record
              </Button>
            )}
            {owner.canRelease && (
              <Button disabled={disabled} onClick={() => sendOwnership('release')}>
                Release assignment
              </Button>
            )}
            {owner.canAssign && operator.capabilities.operator_manage && (
              <IdeaAssignment
                controller={controller}
                data={data}
                disabled={disabled}
                refresh={refresh}
                command={command}
              />
            )}
            {owner.canClaim && (
              <Button
                variant="contained"
                disabled={disabled}
                onClick={() => sendOwnership('claim')}
              >
                Start review
              </Button>
            )}
            {mayDecide && choices.length > 0 && (
              <Button
                variant="contained"
                disabled={
                  disabled || !action || !choices.includes(action) || reason.trim().length < 8
                }
                onClick={() => {
                  if (action)
                    setConfirmation({
                      action,
                      reason: reason.trim(),
                      version: idea.version,
                      revision: owner.revision,
                      assignee: owner.assignedTo,
                    });
                }}
              >
                Continue
              </Button>
            )}
          </>
        )}
      </FormActions>
      <Dialog
        open={!!confirmation}
        onClose={() => {
          if (!checking) setConfirmation(null);
        }}
        fullWidth
        maxWidth="sm"
        aria-labelledby="idea-confirmation"
      >
        <DialogTitle id="idea-confirmation">
          {confirmation && label(confirmation.action)}
        </DialogTitle>
        <DialogContent>
          <Typography sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
            {confirmation?.reason}
          </Typography>
          <Typography sx={{ mt: 2 }}>
            This records the decision and uses the existing member notification rules.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button disabled={checking} onClick={() => setConfirmation(null)}>
            Back
          </Button>
          <Button variant="contained" disabled={disabled} onClick={() => void confirm()}>
            Confirm decision
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
