import { useState } from 'react';
import {
  Alert,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import type { SafetyTarget } from '@doji/portal-data/safety-target';
import type { SafetyRecord } from '@doji/portal-data/safety-record';
import type { useSafetyReport } from './useSafetyReport';
export function SafetyTargetReview({
  item,
  target,
  disabled,
  submit,
}: {
  item: SafetyRecord;
  target: SafetyTarget;
  disabled: boolean;
  submit: (note: string) => ReturnType<ReturnType<typeof useSafetyReport>['submit']>;
}) {
  const [note, setNote] = useState(''),
    [verified, setVerified] = useState(false),
    [confirm, setConfirm] = useState(false);
  const consequence =
    item.queue === 'moderation'
      ? 'Creates an ordinary moderation report. Content visibility stays unchanged.'
      : ['account', 'profile_photo'].includes(target.kind)
        ? 'Creates a restricted review. It does not automatically remove the account or profile photo.'
        : 'Creates a restricted report and quarantines this exact content.';
  return (
    <Stack sx={{ gap: 2 }}>
      <Typography>Verified content ID: {target.id}</Typography>
      <Typography>Owner: {target.username ? '@' + target.username : target.owner}</Typography>
      <Typography sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
        {target.content || 'No text content.'}
      </Typography>
      <Typography>Current visibility: {target.visibility || 'Unknown'}</Typography>
      {target.hasMedia && (
        <Alert severity="info">
          Media is present. This text-only inspection does not fetch or sign media. Inspect
          authorized media in the linked moderation case.
        </Alert>
      )}
      <TextField
        label="Content identification rationale"
        multiline
        minRows={2}
        value={note}
        disabled={disabled || confirm}
        onChange={(event) => setNote(event.target.value)}
        slotProps={{ htmlInput: { maxLength: 2000 } }}
        helperText="Explain how this exact ID matches the original request; do not infer it from similar wording."
      />
      <FormControlLabel
        label="I verified this is the content identified in the request."
        control={
          <Checkbox
            checked={verified}
            disabled={disabled || confirm}
            onChange={(event) => setVerified(event.target.checked)}
          />
        }
      />
      <Button
        variant="contained"
        disabled={disabled || !verified || [...note.trim()].length < 10}
        onClick={() => setConfirm(true)}
      >
        Review report creation
      </Button>
      <Dialog
        open={confirm}
        fullWidth
        maxWidth="sm"
        onClose={() => !disabled && setConfirm(false)}
        aria-labelledby="safety-report-confirm"
      >
        <DialogTitle id="safety-report-confirm">Create linked moderation report</DialogTitle>
        <DialogContent>
          <Stack sx={{ gap: 2 }}>
            <Typography>
              {target.kind.replaceAll('_', ' ')} · {target.id}
            </Typography>
            <Alert severity={item.queue === 'moderation' ? 'info' : 'warning'}>{consequence}</Alert>
            <Typography>
              This does not ban the account, confirm old media URLs are inaccessible, or send an
              email.
            </Typography>
            <Typography sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
              {note.trim()}
            </Typography>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button disabled={disabled} onClick={() => setConfirm(false)}>
            Back
          </Button>
          <Button
            variant="contained"
            disabled={disabled}
            onClick={() => {
              setConfirm(false);
              void submit(note);
            }}
          >
            Create report
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
