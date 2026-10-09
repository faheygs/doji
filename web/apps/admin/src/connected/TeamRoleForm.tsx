import { useImperativeHandle, useState, type Ref } from 'react';
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  MenuItem,
  Stack,
  TextField,
} from '@mui/material';
import {
  employeeRoles,
  validEmployeeRoleInput,
  type EmployeeRole,
} from '@doji/portal-data/employee-team';
import type { EmployeeSessionController } from '@doji/portal-data/employee';
import { useTeamRole } from './useTeamRole';
export type TeamRoleEditor = { selectEmployee(email: string): boolean; canLeave(): boolean };

export function TeamRoleForm({
  controller,
  refresh,
  available,
  ref,
}: {
  controller: EmployeeSessionController;
  refresh(): Promise<boolean>;
  available: boolean;
  ref?: Ref<TeamRoleEditor>;
}) {
  const command = useTeamRole(controller);
  const [email, setEmail] = useState(''),
    [role, setRole] = useState<EmployeeRole>('operations');
  const [action, setAction] = useState('grant'),
    [reason, setReason] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const input = {
    username: email.trim().toLowerCase(),
    role,
    active: action === 'grant',
    reason: reason.trim(),
  };
  const frozen = command.busy || command.uncertain || command.blocked;
  const [selectionBlocked, setSelectionBlocked] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState(false);
  useImperativeHandle(
    ref,
    () => ({
      canLeave() {
        if (frozen || confirmed) {
          setSelectionBlocked(true);
          return false;
        }
        return true;
      },
      selectEmployee(value) {
        if (frozen || confirmed || !available) {
          setSelectionBlocked(true);
          return false;
        }
        setSelectionBlocked(false);
        setEmail(value);
        setSelectedAccount(!!value);
        setRole('operations');
        setAction('grant');
        setReason('');
        return true;
      },
    }),
    [frozen, confirmed, available],
  );
  const valid = validEmployeeRoleInput({
    ...input,
    idempotencyKey: '00000000-0000-4000-8000-000000000000',
  });
  async function submit() {
    const saved = await command.submit();
    if (saved) {
      if (!selectedAccount) setEmail('');
      setReason('');
    }
  }
  return (
    <Stack sx={{ gap: 2 }}>
      <Alert severity="info">
        Grant or revoke a role for a verified employee account. Invitations are not available here.
      </Alert>
      {selectionBlocked && (
        <Alert severity="warning">
          Finish or reconcile the current access change before leaving this editor.
        </Alert>
      )}
      {command.message && (
        <Alert severity={command.uncertain || command.blocked ? 'warning' : 'info'}>
          {command.message}
        </Alert>
      )}
      {command.uncertain && (
        <Button onClick={() => void submit()} disabled={command.busy}>
          Retry identical access change
        </Button>
      )}
      {command.blocked && (
        <Button
          onClick={() =>
            void refresh().then((ok) => {
              if (ok) command.refreshed();
            })
          }
        >
          Refresh directory
        </Button>
      )}
      <Stack
        component="form"
        sx={{ gap: 2 }}
        onSubmit={(event) => {
          event.preventDefault();
          if (valid && !frozen && available) setConfirmed(true);
        }}
      >
        <TextField
          label="Employee email"
          type="email"
          required
          value={email}
          disabled={frozen || selectedAccount}
          onChange={(event) => setEmail(event.target.value)}
          slotProps={{ htmlInput: { maxLength: 254 } }}
        />
        <Stack direction={{ xs: 'column', sm: 'row' }} sx={{ gap: 2 }}>
          <TextField
            select
            label="Action"
            value={action}
            disabled={frozen}
            onChange={(event) => setAction(event.target.value)}
            sx={{ flex: 1 }}
          >
            <MenuItem value="grant">Grant role</MenuItem>
            <MenuItem value="revoke">Revoke role</MenuItem>
          </TextField>
          <TextField
            select
            label="Employee role"
            value={role}
            disabled={frozen}
            onChange={(event) => setRole(event.target.value as EmployeeRole)}
            sx={{ flex: 1 }}
          >
            {employeeRoles.map((value) => (
              <MenuItem key={value} value={value}>
                {value.replaceAll('_', ' ')}
              </MenuItem>
            ))}
          </TextField>
        </Stack>
        <TextField
          label="Access change reason"
          required
          multiline
          minRows={2}
          value={reason}
          disabled={frozen}
          helperText="10–1,000 characters. Retained in the employee access audit."
          onChange={(event) => setReason(event.target.value)}
          slotProps={{ htmlInput: { maxLength: 1000 } }}
        />
        <Stack
          direction="row"
          sx={{ justifyContent: 'flex-end', pt: 2, borderTop: 1, borderColor: 'divider' }}
        >
          <Button type="submit" variant="contained" disabled={!valid || frozen || !available}>
            Review access change
          </Button>
        </Stack>
      </Stack>
      <Dialog
        open={confirmed}
        onClose={() => setConfirmed(false)}
        aria-labelledby="role-confirm-title"
      >
        <DialogTitle id="role-confirm-title">Confirm employee access change</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {input.active ? 'Grant' : 'Revoke'} {role.replaceAll('_', ' ')} for {input.username}?
            This changes employee permissions immediately. Changing your own roles may remove your
            access.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmed(false)}>Cancel</Button>
          <Button
            variant="contained"
            disabled={!valid || frozen || !available}
            onClick={() => {
              setConfirmed(false);
              void command.submit(input).then((saved) => {
                if (saved) {
                  if (!selectedAccount) setEmail('');
                  setReason('');
                }
              });
            }}
          >
            Confirm access change
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
