import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Alert, Box, Button, Paper, Stack, TextField, Typography } from '@mui/material';
import { LocalizationProvider } from '@mui/x-date-pickers';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { FormActions, PageHeader } from '@doji/ui';
import { Link as RouterLink } from 'react-router-dom';
import {
  announcementSchema,
  emptyAnnouncement,
  prepareAnnouncement,
  type AnnouncementInput,
  type AnnouncementIntent,
  type ComposeAction,
} from './announcement';
import { AnnouncementOptions } from './AnnouncementOptions';
import { AnnouncementTiming } from './AnnouncementTiming';
import { AnnouncementReview } from './AnnouncementReview';

export type AnnouncementSubmission = {
  intent: AnnouncementIntent | null;
  phase: 'idle' | 'review' | 'saving' | 'uncertain' | 'rejected' | 'complete';
  message: string;
  prepare(input: AnnouncementIntent): void;
  confirm(): void;
  close(): void;
};
/** Optional connected adapter; the design preview never dispatches a request. */
export function AnnouncementForm({
  initial = emptyAnnouncement,
  target = null,
  submission,
}: {
  initial?: AnnouncementInput | undefined;
  target?: { id: string; version: string } | null | undefined;
  submission?: AnnouncementSubmission | undefined;
}) {
  const [error, setError] = useState('');
  // Pin the revision loaded with these fields. Background reads must not silently
  // pair old edits with a newer record version and overwrite another employee.
  const [originalTarget] = useState(target);
  const [review, setReview] = useState<AnnouncementIntent | null>(null);
  const form = useForm<AnnouncementInput>({
    resolver: zodResolver(announcementSchema),
    defaultValues: initial,
  });
  const {
    control,
    register,
    handleSubmit,
    formState: { errors },
  } = form;
  const values = useWatch({ control });
  const locked = !!submission && submission.phase !== 'idle';
  const prepare = (action: ComposeAction) =>
    handleSubmit((input) => {
      setError('');
      try {
        const intent = prepareAnnouncement(
          input,
          action,
          Date.now(),
          originalTarget,
          crypto.randomUUID(),
        );
        if (submission) submission.prepare(intent);
        else setReview(intent);
      } catch (failure) {
        setError(failure instanceof Error ? failure.message : 'Check the announcement settings.');
      }
    });
  return (
    <LocalizationProvider dateAdapter={AdapterDayjs}>
      <PageHeader
        title={originalTarget ? 'Edit announcement draft' : 'New announcement'}
        description="Write a message and choose when members can see it."
      />
      <Box
        component="form"
        noValidate
        onSubmit={prepare(values.timing === 'scheduled' ? 'schedule' : 'publish')}
      >
        <Box component="fieldset" disabled={locked} sx={{ border: 0, p: 0, m: 0, minWidth: 0 }}>
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 3fr) minmax(18rem, 2fr)' },
              gap: 3,
            }}
          >
            <Stack spacing={3}>
              <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 } }}>
                <Stack spacing={3}>
                  <TextField
                    label="Title"
                    {...register('title')}
                    error={!!errors.title}
                    helperText={errors.title?.message ?? 'Up to 100 characters'}
                    slotProps={{ htmlInput: { maxLength: 100 } }}
                  />
                  <TextField
                    label="Message"
                    multiline
                    minRows={4}
                    {...register('message')}
                    error={!!errors.message}
                    helperText={errors.message?.message ?? 'Up to 600 characters'}
                    slotProps={{ htmlInput: { maxLength: 600 } }}
                  />
                  <AnnouncementTiming form={form} />
                </Stack>
              </Paper>
              <AnnouncementOptions form={form} />
            </Stack>
            <Box component="aside" aria-label="Message preview">
              <Typography component="h2" variant="h6" sx={{ mb: 2 }}>
                Member preview
              </Typography>
              <Paper variant="outlined" sx={{ p: 3, overflowWrap: 'anywhere' }}>
                <Typography variant="h5" component="h3">
                  {values.title?.trim() || 'Your announcement title'}
                </Typography>
                <Typography sx={{ mt: 2, whiteSpace: 'pre-wrap' }}>
                  {values.message?.trim() || 'Your message will appear here.'}
                </Typography>
                {values.reward === 'submit_idea' && (
                  <Typography sx={{ mt: 2 }}>
                    Submit a valid new Doji idea during this campaign to earn {values.sparks || '—'}{' '}
                    Sparks. Once per member.
                  </Typography>
                )}
                {values.ctaLabel?.trim() && (
                  <Button disabled variant="outlined" sx={{ mt: 2 }}>
                    {values.ctaLabel}
                  </Button>
                )}
              </Paper>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
                Content preview, not an exact rendering of the mobile app.
              </Typography>
            </Box>
          </Box>
        </Box>
        {error && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {error}
          </Alert>
        )}
        {!submission && (
          <Stack direction="row" spacing={2} sx={{ my: 3 }}>
            <Button type="submit" variant="outlined">
              Validate preview
            </Button>
            <Button onClick={() => void prepare('save_draft')()}>Preview draft save</Button>
          </Stack>
        )}
        <FormActions>
          <Button component={RouterLink} to="/announcements" disabled={locked}>
            Back
          </Button>
          <Button
            disabled={!submission || locked}
            variant="outlined"
            onClick={() => void prepare('save_draft')()}
          >
            Save draft
          </Button>
          <Button disabled={!submission || locked} variant="contained" type="submit">
            {values.timing === 'scheduled' ? 'Schedule' : 'Publish now'}
          </Button>
        </FormActions>
      </Box>
      <AnnouncementReview
        intent={submission ? submission.intent : review}
        close={submission ? submission.close : () => setReview(null)}
        submission={submission}
      />
    </LocalizationProvider>
  );
}
