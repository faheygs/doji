import { useRef, useState } from 'react';
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
import {
  privacyActions,
  privacyChoices,
  privacyReference,
  type PrivacyAction,
} from '@doji/portal-data/privacy-command';
import type { PrivacyRecord } from '@doji/portal-data/privacy-record';
import type { usePrivacyCommand } from './usePrivacyCommand';
import type { EmployeeSessionController } from '@doji/portal-data/employee';
import { PrivacyAssignment } from './PrivacyAssignment';

const fingerprint = (item: PrivacyRecord) =>
  JSON.stringify([item.id, item.revision, item.state, item.hold, item.owner]);
export function PrivacyActions({
  controller,
  item,
  actor,
  fetching,
  command,
  refresh,
}: {
  controller: EmployeeSessionController;
  item: PrivacyRecord;
  actor: string;
  fetching: boolean;
  command: ReturnType<typeof usePrivacyCommand>;
  refresh(): Promise<PrivacyRecord | undefined>;
}) {
  const [action, setAction] = useState<PrivacyAction | ''>('');
  const [reference, setReference] = useState('');
  const [snapshot, setSnapshot] = useState(() => fingerprint(item));
  const [confirmation, setConfirmation] = useState<{
    action: PrivacyAction;
    reference: string;
    stamp: string;
  } | null>(null);
  const [message, setMessage] = useState('');
  const [checking, setChecking] = useState(false);
  const checkingRef = useRef(false);
  const stale = snapshot !== fingerprint(item);
  const disabled =
    stale || fetching || checking || command.busy || command.blocked || command.uncertain;
  const mine = item.owner.assignedTo === actor;
  // Ownership coordinates review, but does not replace server authorization.
  const mayDecide = !item.owner.actionable || (mine && item.owner.canDecide);
  const choices = mayDecide ? privacyChoices(item) : [];
  const ownership = (value: 'claim' | 'release') =>
    void command.submit({
      id: item.id,
      revision: item.revision,
      ownerRevision: item.owner.revision,
      state: item.state,
      action: value,
      reference: '',
    });
  async function confirm() {
    if (!confirmation || disabled || checkingRef.current) return;
    checkingRef.current = true;
    setChecking(true);
    try {
      const fresh = await refresh();
      if (
        !fresh ||
        fingerprint(fresh) !== confirmation.stamp ||
        (fresh.owner.actionable && fresh.owner.assignedTo !== actor) ||
        !privacyChoices(fresh).includes(confirmation.action)
      ) {
        setMessage(
          'The case, hold or assignment changed. Review the current record before continuing.',
        );
        setConfirmation(null);
        return;
      }
      const selected = confirmation;
      setConfirmation(null);
      await command.submit({
        id: fresh.id,
        revision: fresh.revision,
        ownerRevision: fresh.owner.revision,
        state: fresh.state,
        action: selected.action,
        reference: selected.reference,
      });
    } finally {
      checkingRef.current = false;
      setChecking(false);
    }
  }
  return (
    <>
      {message && <Alert severity="warning">{message}</Alert>}
      {stale && !command.uncertain && (
        <Alert severity="warning">
          The case or assignment changed. Reload the action form before continuing.
          <Button
            disabled={command.busy || checking || fetching}
            onClick={() => {
              setSnapshot(fingerprint(item));
              setAction('');
              setReference('');
              setConfirmation(null);
              setMessage('');
            }}
          >
            Reload action form
          </Button>
        </Alert>
      )}
      {choices.length > 0 && (
        <RecordSection title="Request action">
          <Stack sx={{ gap: 2 }}>
            <TextField
              select
              fullWidth
              label="Action"
              value={choices.includes(action as PrivacyAction) ? action : ''}
              disabled={disabled}
              onChange={(event) => setAction(event.target.value as PrivacyAction)}
            >
              {choices.map((value) => (
                <MenuItem key={value} value={value}>
                  {privacyActions[value][0]}
                </MenuItem>
              ))}
            </TextField>
            {action && <Typography>{privacyActions[action][1]}</Typography>}
            <TextField
              fullWidth
              label="Protected evidence reference"
              value={reference}
              disabled={disabled}
              onChange={(event) => setReference(event.target.value)}
              slotProps={{ htmlInput: { maxLength: 128 } }}
              helperText="Use an opaque 8–128 character support-record reference. No names, emails or evidence contents."
            />
          </Stack>
        </RecordSection>
      )}
      {!mine && item.owner.actionable && item.owner.assignedTo && (
        <Alert severity="info">
          Assigned to {item.owner.label}. The assigned reviewer handles the outcome.
        </Alert>
      )}
      <FormActions>
        {!command.uncertain && (
          <>
            {item.owner.canRelease && (
              <Button disabled={disabled} onClick={() => ownership('release')}>
                Release assignment
              </Button>
            )}
            {item.owner.canClaim && (
              <Button variant="contained" disabled={disabled} onClick={() => ownership('claim')}>
                Start review
              </Button>
            )}
            {item.owner.canAssign && (
              <PrivacyAssignment
                controller={controller}
                item={item}
                disabled={disabled}
                command={command}
                refresh={refresh}
              />
            )}
            {choices.length > 0 && (
              <Button
                variant="contained"
                disabled={disabled || !action || !privacyReference(reference.trim())}
                onClick={() => {
                  if (action)
                    setConfirmation({
                      action,
                      reference: reference.trim(),
                      stamp: fingerprint(item),
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
        aria-labelledby="privacy-confirmation"
      >
        <DialogTitle id="privacy-confirmation">
          {confirmation && privacyActions[confirmation.action][0]}
        </DialogTitle>
        <DialogContent>
          <Stack sx={{ gap: 2 }}>
            <Typography>{confirmation && privacyActions[confirmation.action][1]}</Typography>
            <Typography sx={{ overflowWrap: 'anywhere' }}>
              Business account: {item.accountId}
            </Typography>
            <Typography sx={{ overflowWrap: 'anywhere' }}>
              Evidence reference: {confirmation?.reference}
            </Typography>
            {stale && (
              <Alert severity="warning">
                The record changed. Cancel and review the current details.
              </Alert>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button disabled={checking} onClick={() => setConfirmation(null)}>
            Back
          </Button>
          <Button variant="contained" disabled={disabled} onClick={() => void confirm()}>
            Confirm action
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
