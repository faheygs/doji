import { useRef } from 'react';
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Typography,
} from '@mui/material';
import { announcementDestinations, type AnnouncementIntent } from './announcement';
import type { AnnouncementSubmission } from './AnnouncementForm';

export function AnnouncementReview({
  intent,
  close,
  submission,
}: {
  intent: AnnouncementIntent | null;
  close(): void;
  submission?: AnnouncementSubmission | undefined;
}) {
  const input = intent?.p_input;
  const action = intent?.p_action;
  const back = useRef<HTMLButtonElement>(null);
  const locked = submission?.phase === 'saving' || submission?.phase === 'uncertain';
  return (
    <Dialog
      open={!!intent}
      onClose={locked ? undefined : close}
      fullWidth
      maxWidth="sm"
      aria-labelledby="announcement-review-title"
      slotProps={{ transition: { onEntered: () => back.current?.focus() } }}
    >
      <DialogTitle id="announcement-review-title">
        {action === 'save_draft'
          ? 'Review draft'
          : action === 'schedule'
            ? 'Review schedule'
            : 'Review publication'}
      </DialogTitle>
      <DialogContent>
        {input && (
          <Stack spacing={2}>
            {!submission && (
              <Alert severity="info">
                Local preview only. Nothing will be saved, published or sent.
              </Alert>
            )}
            {submission?.message && <Alert severity="warning">{submission.message}</Alert>}
            <Typography component="h2" variant="h6">
              {input.title}
            </Typography>
            <Typography sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
              {input.body}
            </Typography>
            <Typography color="text.secondary">
              {action === 'publish'
                ? 'Starts when the server accepts publication.'
                : 'Starts: ' + input.starts_at + ' (UTC)'}
              <br />
              Ends: {input.ends_at} (UTC)
            </Typography>
            {input.cta_url && (
              <Typography>
                Button: {input.cta_label} · {announcementDestinations[input.cta_url]}
              </Typography>
            )}
            <Typography>
              {input.reward_action
                ? input.reward_sparks + ' Sparks per qualifying new idea, once per member.'
                : 'No completion reward.'}
            </Typography>
            <Typography>
              {input.max_impressions_per_user} maximum displays per account, at least{' '}
              {input.min_hours_between_impressions} hours apart.
            </Typography>
            <Typography color="text.secondary">
              {action === 'save_draft'
                ? 'Saving a draft does not make it visible to members.'
                : 'Eligible members may see this during the published window. This does not send a push or confirm delivery.'}
            </Typography>
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        <Button ref={back} onClick={close} disabled={locked}>
          {submission?.phase === 'rejected' ? 'Return to record' : 'Back to editing'}
        </Button>
        <Button
          variant="contained"
          disabled={!submission || !['review', 'uncertain'].includes(submission.phase)}
          onClick={submission?.confirm}
        >
          {submission?.phase === 'saving'
            ? 'Saving…'
            : submission?.phase === 'uncertain'
              ? 'Retry identical action'
              : action === 'save_draft'
                ? 'Save draft'
                : action === 'schedule'
                  ? 'Schedule'
                  : 'Publish now'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
