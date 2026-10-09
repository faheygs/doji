import { useRef, useState } from 'react';
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
} from '@mui/material';
import type { EmployeeSessionController } from '@doji/portal-data/employee';
import type { PrivacyRecord } from '@doji/portal-data/privacy-record';
import type { usePrivacyCommand } from './usePrivacyCommand';
import { BusinessAssigneePicker } from './BusinessAssigneePicker';
export function PrivacyAssignment({
  controller,
  item,
  disabled,
  refresh,
  command,
}: {
  controller: EmployeeSessionController;
  item: PrivacyRecord;
  disabled: boolean;
  refresh(): Promise<PrivacyRecord | undefined>;
  command: ReturnType<typeof usePrivacyCommand>;
}) {
  const [snapshot, setSnapshot] = useState<PrivacyRecord | null>(null);
  const [target, setTarget] = useState(''),
    [message, setMessage] = useState('');
  const [checking, setChecking] = useState(false),
    checkingRef = useRef(false);
  const same = (value: PrivacyRecord) =>
    snapshot &&
    value.id === snapshot.id &&
    value.revision === snapshot.revision &&
    value.owner.revision === snapshot.owner.revision &&
    value.owner.assignedTo === snapshot.owner.assignedTo &&
    value.owner.canAssign;
  const stale = !!snapshot && !same(item);
  async function submit() {
    if (!snapshot || !target || disabled || stale || checkingRef.current) return;
    checkingRef.current = true;
    setChecking(true);
    const selected = target;
    try {
      const fresh = await refresh();
      if (!fresh || !same(fresh)) {
        setMessage('Ownership or permissions changed. Cancel and review the current case.');
        return;
      }
      setSnapshot(null);
      await command.submit({
        id: fresh.id,
        revision: fresh.revision,
        ownerRevision: fresh.owner.revision,
        state: fresh.state,
        action: 'assign',
        reference: '',
        target: selected,
      });
    } finally {
      checkingRef.current = false;
      setChecking(false);
    }
  }
  return (
    <>
      <Button
        disabled={disabled || checking}
        onClick={() => {
          setTarget('');
          setMessage('');
          setSnapshot(item);
        }}
      >
        Change assignee
      </Button>
      <Dialog
        open={!!snapshot}
        onClose={() => {
          if (!checking) setSnapshot(null);
        }}
        fullWidth
        maxWidth="sm"
        aria-labelledby="privacy-assignment-title"
      >
        <DialogTitle id="privacy-assignment-title">Change assignee</DialogTitle>
        <DialogContent>
          <Stack sx={{ gap: 2, pt: 1 }}>
            {(stale || message) && (
              <Alert severity="warning">
                {message || 'Ownership changed. Cancel and review the current case.'}
              </Alert>
            )}
            {snapshot && (
              <BusinessAssigneePicker
                controller={controller}
                kind="business_privacy"
                id={item.id}
                owner={snapshot.owner.assignedTo}
                disabled={disabled || checking || stale || !!message}
                selected={target}
                select={setTarget}
              />
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button disabled={checking} onClick={() => setSnapshot(null)}>
            Cancel
          </Button>
          <Button
            variant="contained"
            disabled={
              disabled ||
              checking ||
              stale ||
              !!message ||
              !target ||
              target === item.owner.assignedTo
            }
            onClick={() => void submit()}
          >
            Assign reviewer
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
