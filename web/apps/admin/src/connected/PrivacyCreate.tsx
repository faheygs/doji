import { useState, useSyncExternalStore } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Alert,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { DateTimePicker, LocalizationProvider } from '@mui/x-date-pickers';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import type { Dayjs } from 'dayjs';
import { PageHeader, RecordSection, FormActions } from '@doji/ui';
import type { EmployeeSessionController } from '@doji/portal-data/employee';
import { canReadPrivacy, privacyKinds } from '@doji/portal-data/privacy-record';
import { validPrivacyCreate, type PrivacyCreateInput } from '@doji/portal-data/privacy-create';
import { usePrivacyCreate } from './usePrivacyCreate';
type Draft = Omit<PrivacyCreateInput, 'key'>;
export function PrivacyCreate({ controller }: { controller: EmployeeSessionController }) {
  const session = useSyncExternalStore(controller.subscribe, controller.getSnapshot),
    navigate = useNavigate();
  const [account, setAccount] = useState(''),
    [kind, setKind] = useState<keyof typeof privacyKinds | ''>('');
  const [reference, setReference] = useState(''),
    [due, setDue] = useState<Dayjs | null>(null),
    [verified, setVerified] = useState(false);
  const [confirmation, setConfirmation] = useState<Draft | null>(null);
  const command = usePrivacyCreate(controller);
  if (!session.session || !canReadPrivacy(controller))
    return <Alert severity="error">Privacy review access is unavailable.</Alert>;
  const draft =
    kind && due?.isValid()
      ? { account: account.trim(), kind, reference: reference.trim(), due: due.toISOString() }
      : null;
  const valid =
    !!draft &&
    validPrivacyCreate({ ...draft, key: '00000000-0000-4000-8000-000000000000' }) &&
    verified;
  const disabled = command.busy || command.uncertain || !!command.id;
  const submit = async () => {
    const captured = confirmation;
    setConfirmation(null);
    const id = await command.submit(captured ?? undefined);
    if (id) navigate('/business-privacy/' + id);
  };
  return (
    <>
      <Button component={Link} to="/business-privacy" disabled={command.busy || command.uncertain}>
        Back to privacy requests
      </Button>
      <PageHeader
        title="Log verified privacy request"
        description="Record a request already verified through protected support."
      />
      <Alert severity="info">
        Verify the exact business account, requester authority, scope and deadline first. Logging a
        request does not close access, erase information or send an email.
      </Alert>
      {command.message && (
        <Alert severity={command.uncertain || command.rejected ? 'warning' : 'success'}>
          {command.message}
        </Alert>
      )}
      <RecordSection title="Request details">
        <Stack sx={{ gap: 3 }}>
          <TextField
            label="Verified business account ID"
            value={account}
            disabled={disabled}
            onChange={(e) => setAccount(e.target.value)}
            slotProps={{ htmlInput: { maxLength: 36 } }}
            helperText="Exact business UUID from the verified support record. Never a member account or a guessed match."
          />
          <TextField
            select
            label="Request type"
            value={kind}
            disabled={disabled}
            onChange={(e) => setKind(e.target.value as keyof typeof privacyKinds)}
          >
            {Object.entries(privacyKinds).map(([value, label]) => (
              <MenuItem key={value} value={value}>
                {label}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            label="Verification reference"
            value={reference}
            disabled={disabled}
            onChange={(e) => setReference(e.target.value)}
            slotProps={{ htmlInput: { maxLength: 128 } }}
            helperText="Opaque 8–128 character protected-record reference. No names, emails or evidence contents."
          />
          <LocalizationProvider dateAdapter={AdapterDayjs}>
            <DateTimePicker
              label="Assessed response deadline"
              value={due}
              onChange={setDue}
              disabled={disabled}
              slotProps={{
                textField: {
                  helperText:
                    'Your local time. Assess from the original support receipt; no legal deadline is inferred.',
                },
              }}
            />
          </LocalizationProvider>
          <FormControlLabel
            control={
              <Checkbox
                checked={verified}
                disabled={disabled}
                onChange={(e) => setVerified(e.target.checked)}
              />
            }
            label="I verified the account, requester authority, scope and assessed deadline."
          />
        </Stack>
      </RecordSection>
      <FormActions>
        {command.uncertain ? (
          <Button variant="contained" disabled={command.busy} onClick={() => void submit()}>
            Retry identical request
          </Button>
        ) : (
          <Button
            variant="contained"
            disabled={disabled || !valid}
            onClick={() => setConfirmation(draft)}
          >
            Review request
          </Button>
        )}
      </FormActions>
      <Dialog
        open={!!confirmation}
        onClose={() => setConfirmation(null)}
        fullWidth
        maxWidth="sm"
        aria-labelledby="privacy-create-title"
      >
        <DialogTitle id="privacy-create-title">Confirm verified request</DialogTitle>
        <DialogContent>
          <Stack sx={{ gap: 2 }}>
            <Typography>{confirmation && privacyKinds[confirmation.kind]}</Typography>
            <Typography sx={{ overflowWrap: 'anywhere' }}>
              Business: {confirmation?.account}
            </Typography>
            <Typography>
              Assessed deadline: {confirmation && new Date(confirmation.due).toLocaleString()}
            </Typography>
            <Typography sx={{ overflowWrap: 'anywhere' }}>
              Verification: {confirmation?.reference}
            </Typography>
            <Typography>
              This records a support case only. It does not fulfill the request or contact the
              requester.
            </Typography>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmation(null)}>Back</Button>
          <Button variant="contained" disabled={disabled} onClick={() => void submit()}>
            Record request
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
