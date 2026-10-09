import { useRef } from 'react';
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Stack,
  Typography,
} from '@mui/material';
import { businessDecisions } from '@doji/portal-data/business-decision';
import type { useBusinessDecision } from './useBusinessDecision';

export function BusinessDecisionDialog({
  decision,
  brand,
  submission,
  stale,
  allowed,
  fetching,
  canConfirm,
  reload,
  saved,
}: {
  decision: ReturnType<typeof useBusinessDecision>;
  brand: string;
  submission: number;
  stale: boolean;
  allowed: boolean;
  fetching: boolean;
  canConfirm: boolean;
  reload(): Promise<void>;
  saved(): void;
}) {
  const intent = decision.intent;
  const back = useRef<HTMLButtonElement>(null);
  return (
    <Dialog
      open={!!intent}
      aria-labelledby="business-confirm-title"
      fullWidth
      maxWidth="sm"
      slotProps={{ transition: { onEntered: () => back.current?.focus() } }}
      onClose={() => {
        if (!decision.busy && !decision.uncertain) decision.cancel();
      }}
    >
      <DialogTitle id="business-confirm-title">
        {intent ? businessDecisions[intent.p_action].label : 'Confirm decision'}
      </DialogTitle>
      <DialogContent>
        {intent && (
          <Stack sx={{ gap: 2 }}>
            <DialogContentText>
              {brand} · Submission {submission} · Revision {intent.p_revision}
            </DialogContentText>
            <DialogContentText>{businessDecisions[intent.p_action].effect}</DialogContentText>
            <Typography sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
              Applicant response: {intent.p_response}
            </Typography>
            <Typography sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
              Internal note: {intent.p_internal_note}
            </Typography>
            {(stale || !allowed) && !decision.uncertain && (
              <Alert severity="warning">
                The record or its ownership changed. Refresh before reviewing again.
              </Alert>
            )}
            {decision.message && <Alert severity="warning">{decision.message}</Alert>}
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        {decision.uncertain || decision.blocked || stale ? (
          <Button disabled={decision.busy || fetching} onClick={() => void reload()}>
            Refresh application
          </Button>
        ) : (
          <Button ref={back} disabled={decision.busy} onClick={decision.cancel}>
            Back
          </Button>
        )}
        <Button
          variant="contained"
          disabled={!canConfirm}
          onClick={() => {
            if (canConfirm)
              void decision.submit().then((confirmed) => {
                if (confirmed) saved();
              });
          }}
        >
          {decision.busy
            ? 'Saving…'
            : decision.uncertain
              ? 'Retry same decision'
              : 'Confirm decision'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
