import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { FormActions } from '@doji/ui';
import type { EmployeeSessionController } from '@doji/portal-data/employee';
import type { PrivacyRecord } from '@doji/portal-data/privacy-record';
import {
  applicationFields,
  readPrivacyCorrection,
  validCorrectionDetails,
} from '@doji/portal-data/privacy-data';
import { privacyReference } from '@doji/portal-data/privacy-command';
import type { usePrivacyCommand } from './usePrivacyCommand';
type Correction = Extract<
  Awaited<ReturnType<typeof readPrivacyCorrection>>,
  { allowed: true }
>['application'];
const stamp = (item: PrivacyRecord, app: Correction) =>
  JSON.stringify([item.id, item.revision, item.owner, app.id, app.revision, app.state]);
export function PrivacyCorrectionForm({
  controller,
  item,
  application,
  fetching,
  command,
  refresh,
}: {
  controller: EmployeeSessionController;
  item: PrivacyRecord;
  application: Correction;
  fetching: boolean;
  command: ReturnType<typeof usePrivacyCommand>;
  refresh(): Promise<PrivacyRecord | undefined>;
}) {
  const [snapshot, setSnapshot] = useState(() => stamp(item, application));
  const scope = useRef<AbortController | null>(null);
  useEffect(() => {
    const abort = new AbortController();
    scope.current = abort;
    return () => abort.abort();
  }, []);
  const [details, setDetails] = useState(() => ({ ...application.details })),
    [reference, setReference] = useState('');
  const [confirmation, setConfirmation] = useState<{
    details: Record<string, string>;
    reference: string;
  } | null>(null);
  const [checking, setChecking] = useState(false),
    running = useRef(false),
    [message, setMessage] = useState('');
  const stale = snapshot !== stamp(item, application);
  const disabled =
    stale || fetching || checking || command.busy || command.blocked || command.uncertain;
  const changed = applicationFields.some(
    ([key]) => (details[key] ?? '') !== (application.details[key] ?? ''),
  );
  const confirm = async () => {
    if (!confirmation || disabled || running.current) return;
    running.current = true;
    setChecking(true);
    setMessage('');
    const session = controller.getSnapshot().session;
    const abort = scope.current;
    if (!abort || abort.signal.aborted) {
      running.current = false;
      setChecking(false);
      return;
    }
    try {
      const fresh = await refresh();
      if (
        !fresh ||
        fresh.revision !== item.revision ||
        fresh.owner.revision !== item.owner.revision ||
        fresh.owner.assignedTo !== controller.getSnapshot().operator?.user_id ||
        !fresh.owner.canDecide
      )
        throw Error('changed');
      const current = await readPrivacyCorrection(controller, fresh, abort.signal);
      if (
        abort.signal.aborted ||
        controller.getSnapshot().session !== session ||
        !current.allowed ||
        stamp(fresh, current.application) !== snapshot
      )
        throw Error('changed');
      const input = confirmation;
      setConfirmation(null);
      await command.submit({
        id: item.id,
        revision: item.revision,
        ownerRevision: item.owner.revision,
        state: item.state,
        action: 'correct_draft',
        reference: input.reference,
        details: input.details,
        applicationRevision: application.revision,
      });
    } catch {
      if (abort.signal.aborted || controller.getSnapshot().session !== session) return;
      setConfirmation(null);
      setMessage(
        'The case or editable draft could not be reverified. Reload the draft before saving; no correction was sent.',
      );
    } finally {
      running.current = false;
      setChecking(false);
    }
  };
  return (
    <>
      <Typography>
        Application {application.id} · Revision {application.revision}
      </Typography>
      {(stale || message) && (
        <Alert severity="warning">
          {message || 'The draft or case changed. Your edits are preserved; reload before saving.'}
          <Button
            disabled={fetching || checking || command.busy || command.uncertain}
            onClick={() => {
              setSnapshot(stamp(item, application));
              setDetails({ ...application.details });
              setReference('');
              setMessage('');
              setConfirmation(null);
            }}
          >
            Reload draft form
          </Button>
        </Alert>
      )}
      <Stack sx={{ gap: 2 }}>
        {applicationFields.map(([key, label]) => (
          <TextField
            key={key}
            fullWidth
            label={label}
            value={details[key] ?? ''}
            disabled={disabled}
            multiline={key === 'purpose' || key === 'business_address'}
            minRows={key === 'purpose' || key === 'business_address' ? 3 : undefined}
            slotProps={{
              input: { readOnly: key === 'business_address' },
              htmlInput: { maxLength: key === 'country' ? 2 : 1000 },
            }}
            helperText={
              key === 'business_address'
                ? 'Previously recorded address is retained unchanged.'
                : key === 'website'
                  ? 'Public HTTPS URL; never fetched by this form.'
                  : undefined
            }
            onChange={(event) => setDetails({ ...details, [key]: event.target.value })}
          />
        ))}
        <TextField
          label="Correction evidence reference"
          value={reference}
          disabled={disabled}
          onChange={(event) => setReference(event.target.value)}
          slotProps={{ htmlInput: { maxLength: 128 } }}
          helperText="Opaque protected-record reference only. No names, emails or evidence contents."
        />
      </Stack>
      <FormActions>
        <Button
          variant="contained"
          disabled={
            disabled ||
            !!message ||
            !changed ||
            !validCorrectionDetails(details) ||
            !privacyReference(reference.trim())
          }
          onClick={() => setConfirmation({ details: { ...details }, reference: reference.trim() })}
        >
          Review corrected draft
        </Button>
      </FormActions>
      <Dialog
        open={!!confirmation}
        onClose={() => {
          if (!checking) setConfirmation(null);
        }}
        fullWidth
        maxWidth="sm"
        aria-labelledby="privacy-correction-title"
      >
        <DialogTitle id="privacy-correction-title">Save corrected draft</DialogTitle>
        <DialogContent>
          <Stack sx={{ gap: 2 }}>
            <Typography>Only the following current-draft fields will change:</Typography>
            {applicationFields
              .filter(
                ([key]) => (confirmation?.details[key] ?? '') !== (application.details[key] ?? ''),
              )
              .map(([key, label]) => (
                <Typography key={key} sx={{ overflowWrap: 'anywhere' }}>
                  {label}: {confirmation?.details[key] || '(empty)'}
                </Typography>
              ))}
            <Typography>
              Submitted snapshots and agreements remain unchanged. No application is submitted,
              approved or emailed.
            </Typography>
            {stale && (
              <Alert severity="warning">The draft changed. Cancel and review it again.</Alert>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button disabled={checking} onClick={() => setConfirmation(null)}>
            Back
          </Button>
          <Button variant="contained" disabled={disabled} onClick={() => void confirm()}>
            Save corrected draft
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
