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
import type { IdeaRecord } from '@doji/portal-data/idea-record';
import type { useIdeaCommand } from './useIdeaCommand';
import { BusinessAssigneePicker } from './BusinessAssigneePicker';

export function IdeaAssignment({
  controller,
  data,
  disabled,
  refresh,
  command,
}: {
  controller: EmployeeSessionController;
  data: IdeaRecord;
  disabled: boolean;
  refresh(): Promise<IdeaRecord | undefined>;
  command: ReturnType<typeof useIdeaCommand>;
}) {
  const [snapshot, setSnapshot] = useState<IdeaRecord | null>(null);
  const [target, setTarget] = useState('');
  const [checking, setChecking] = useState(false);
  const checkingRef = useRef(false);
  const [message, setMessage] = useState('');
  const stale =
    !!snapshot &&
    (snapshot.idea.version !== data.idea.version ||
      snapshot.owner.revision !== data.owner.revision ||
      snapshot.owner.assignedTo !== data.owner.assignedTo ||
      !data.owner.canAssign);
  const submit = async () => {
    if (!snapshot || !target || disabled || stale || checkingRef.current) return;
    checkingRef.current = true;
    setChecking(true);
    const selected = target;
    try {
      const fresh = await refresh();
      if (
        !fresh ||
        !fresh.owner.canAssign ||
        fresh.idea.version !== snapshot.idea.version ||
        fresh.owner.revision !== snapshot.owner.revision ||
        fresh.owner.assignedTo !== snapshot.owner.assignedTo
      ) {
        setMessage('Ownership or permissions changed. Cancel and refresh before reassigning.');
        return;
      }
      // The command hook retains this exact target and key if its outcome is uncertain.
      setSnapshot(null);
      await command.submit({
        id: data.idea.id,
        action: 'assign',
        target: selected,
        version: snapshot.idea.version,
        revision: snapshot.owner.revision,
        reason: '',
      });
    } finally {
      checkingRef.current = false;
      setChecking(false);
    }
  };
  return (
    <>
      <Button
        disabled={disabled || checking}
        onClick={() => {
          setTarget('');
          setMessage('');
          setSnapshot(data);
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
        aria-labelledby="idea-assignment-title"
      >
        <DialogTitle id="idea-assignment-title">Change assignee</DialogTitle>
        <DialogContent>
          <Stack sx={{ gap: 2, pt: 1 }}>
            {(stale || message) && (
              <Alert severity="warning">
                {message ||
                  'Ownership or permissions changed. Cancel and refresh before reassigning.'}
              </Alert>
            )}
            {snapshot && (
              <BusinessAssigneePicker
                controller={controller}
                kind="suggestion"
                id={data.idea.id}
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
              target === data.owner.assignedTo
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
