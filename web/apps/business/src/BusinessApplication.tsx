import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  Divider,
  FormControlLabel,
  Link,
  List,
  ListItem,
  ListItemText,
  MenuItem,
  Paper,
  Stack,
  Step,
  StepLabel,
  Stepper,
  TextField,
  Typography,
} from '@mui/material';
import type { ApplicationSnapshot } from '../../../../website/business-portal/application-client.mts';
import {
  applicationEvidence,
  journeyState,
} from '../../../../website/business-portal/identity/journey-model.mts';
import {
  applicationFields,
  applicationFormValues,
} from '../../../../website/business-portal/application-form.mts';
import { industries } from './business-fields';
import type { Runtime } from './business-runtime';
import { Loading } from './BusinessLoading';
import { Workspace } from './BusinessWorkspace';
import { BusinessOnboarding } from './BusinessOnboarding';
import type { BusinessFormState } from './BusinessLeaveGuard';
export function Application({
  runtime: { client, controller, config },
  state,
  onSetupState,
}: {
  runtime: Runtime;
  state: ApplicationSnapshot;
  onSetupState?: (state: BusinessFormState) => void;
}) {
  const [review, setReview] = useState(false);
  const [consent, setConsent] = useState(false);
  const [notice, setNotice] = useState('');
  const form = useRef<HTMLFormElement>(null);
  const previous = useRef(state.application?.revision);
  useEffect(() => {
    if (previous.current !== state.application?.revision) {
      setConsent(false);
      previous.current = state.application?.revision;
    }
  }, [state.application?.revision]);
  if (!state.loaded)
    return state.readError ? (
      <Alert severity="error">
        Your application could not be loaded. Use Refresh status to try again.
      </Alert>
    ) : (
      <Loading />
    );
  const journey = journeyState(state.application);
  if (
    window.DOJI_REACT_BUSINESS_CONFIG?.setupEnabled === true &&
    state.application?.state === 'approved' &&
    !state.readError
  )
    return (
      <BusinessOnboarding
        client={client}
        applicationRevision={state.application.revision}
        reconciledAt={state.lastCheckedAt}
        {...(onSetupState ? { onFormState: onSetupState } : {})}
      />
    );
  const evidence = applicationEvidence(state.application);
  const editable =
    !state.application || ['draft', 'changes_requested'].includes(state.application.state || '');
  const sync = () => {
    if (form.current)
      for (const [key, value] of Object.entries(applicationFormValues(form.current)))
        controller.edit(key, value);
  };
  const command = async (action: 'save' | 'submit') => {
    if (action === 'save') sync();
    const epoch = client.epoch();
    await controller.command(
      action,
      action === 'submit' ? config.termsVersion : undefined,
      action === 'submit' ? config.privacyVersion : undefined,
    );
    if (epoch !== client.epoch()) return;
    const next = controller.snapshot();
    if (!next.error && !next.stale) {
      setReview(false);
      setNotice(action === 'save' ? 'Draft saved.' : 'Your application was received.');
    }
  };
  return (
    <Stack spacing={3}>
      <Box>
        <Chip
          label={journey.title}
          color={state.application?.state === 'approved' ? 'success' : 'default'}
          sx={{ mb: 2 }}
        />
        <Typography variant="h2" component="h1">
          {journey.heading}
        </Typography>
        <Typography sx={{ mt: 2 }} color="text.secondary">
          {journey.description}
        </Typography>
      </Box>
      <Stepper activeStep={Math.max(0, journey.step - 1)} alternativeLabel>
        <Step completed>
          <StepLabel>Account</StepLabel>
        </Step>
        <Step>
          <StepLabel>Business details</StepLabel>
        </Step>
        <Step>
          <StepLabel>Review</StepLabel>
        </Step>
      </Stepper>
      {notice && <Alert severity="success">{notice}</Alert>}
      {state.error && <Alert severity="error">{state.error}</Alert>}
      {state.readError && (
        <Alert severity="warning">
          Status could not be refreshed. Your entries are preserved. Refresh before continuing.
        </Alert>
      )}
      {state.stale && (
        <Alert
          severity="warning"
          action={
            <Button
              color="inherit"
              onClick={() => {
                if (
                  !state.dirty ||
                  window.confirm('Discard unsaved changes and load the current application?')
                ) {
                  setReview(false);
                  void controller.load(true);
                }
              }}
            >
              Reload
            </Button>
          }
        >
          Your application changed. Reload the latest version before continuing.
        </Alert>
      )}
      {state.application?.response && (
        <Paper variant="outlined" sx={{ p: 3 }}>
          <Typography variant="h6">From Doji</Typography>
          <Typography sx={{ whiteSpace: 'pre-wrap', mt: 1 }}>
            {state.application.response}
          </Typography>
        </Paper>
      )}
      {!editable && (
        <Paper variant="outlined" sx={{ p: 3 }}>
          <Stack spacing={2}>
            <Typography variant="h5">{journey.title}</Typography>
            <Typography>{journey.next}</Typography>
            {evidence.reference && (
              <Typography sx={{ overflowWrap: 'anywhere' }}>
                Reference: {evidence.reference}
              </Typography>
            )}
            {evidence.submitted && <Typography>Submitted: {evidence.submitted}</Typography>}
            <Stack direction="row" spacing={2}>
              <Button onClick={() => window.print()}>Print / save receipt</Button>
              <Button href="mailto:support@dojipro.com">Contact support</Button>
            </Stack>
          </Stack>
        </Paper>
      )}
      {state.application?.state === 'approved' && !state.readError && <Workspace client={client} />}
      <Paper variant="outlined" sx={{ p: { xs: 3, md: 4 } }}>
        <Stack
          component="form"
          ref={form}
          spacing={3}
          onSubmit={(event) => {
            event.preventDefault();
            if (state.pending || state.stale || state.readError) return;
            sync();
            setReview(true);
            setConsent(false);
            setNotice('');
          }}
        >
          <Typography variant="h5" component="h2">
            {review && editable ? 'Check your answers' : 'Business details'}
          </Typography>
          <Box
            key={`${state.draftVersion}:${review}`}
            sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 3 }}
          >
            {applicationFields
              .filter(([key]) => key !== 'business_address' || (!editable && state.draft[key]))
              .map(([key, label]) => {
                const readOnly = !editable || review;
                const value = String(
                  controller.snapshot().draft[key] ?? (key === 'country' ? 'US' : ''),
                );
                return (
                  <TextField
                    key={key}
                    name={key}
                    label={key === 'country' ? 'Country' : label}
                    defaultValue={value}
                    fullWidth
                    required={editable}
                    disabled={state.pending}
                    select={!readOnly && ['country', 'category'].includes(key)}
                    multiline={['purpose', 'business_address'].includes(key)}
                    minRows={3}
                    type={key === 'website' && !readOnly ? 'url' : 'text'}
                    slotProps={{
                      input: { readOnly },
                      htmlInput: {
                        maxLength: key === 'country' ? 2 : 1000,
                        ...(key === 'website' && !readOnly ? { pattern: 'https://.*' } : {}),
                      },
                    }}
                    onChange={(event) => {
                      controller.edit(key, event.target.value);
                      setNotice('');
                    }}
                    sx={{
                      gridColumn: ['purpose', 'business_address'].includes(key)
                        ? '1 / -1'
                        : undefined,
                    }}
                  >
                    {key === 'country' ? (
                      <MenuItem value="US">United States</MenuItem>
                    ) : key === 'category' ? (
                      industries.map((industry) => (
                        <MenuItem key={industry} value={industry}>
                          {industry}
                        </MenuItem>
                      ))
                    ) : null}
                  </TextField>
                );
              })}
          </Box>
          {editable && review && (
            <FormControlLabel
              control={
                <Checkbox
                  checked={consent}
                  onChange={(event) => setConsent(event.target.checked)}
                  disabled={state.pending}
                />
              }
              label={
                <>
                  I am authorized to represent this business, confirm these details are accurate,
                  accept the{' '}
                  <Link href={config.termsUrl} target="_blank" rel="noopener noreferrer">
                    application terms
                  </Link>{' '}
                  and acknowledge the{' '}
                  <Link href={config.privacyUrl} target="_blank" rel="noopener noreferrer">
                    privacy notice
                  </Link>
                  .
                </>
              }
            />
          )}
          {editable && (
            <>
              <Divider />
              <Stack direction="row" sx={{ justifyContent: 'flex-end', gap: 2, flexWrap: 'wrap' }}>
                {review ? (
                  <>
                    <Button disabled={state.pending} onClick={() => setReview(false)}>
                      Edit details
                    </Button>
                    <Button
                      variant="contained"
                      disabled={!consent || state.pending || state.stale || !!state.readError}
                      onClick={() => void command('submit')}
                    >
                      {state.pending ? 'Submitting…' : 'Submit for review'}
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      disabled={state.pending || state.stale || !!state.readError}
                      onClick={() => void command('save')}
                    >
                      Save draft
                    </Button>
                    <Button
                      type="submit"
                      variant="contained"
                      disabled={state.pending || state.stale || !!state.readError}
                    >
                      Check answers
                    </Button>
                  </>
                )}
              </Stack>
            </>
          )}
        </Stack>
      </Paper>
      {evidence.history.length > 0 && (
        <Paper variant="outlined" sx={{ p: 3 }}>
          <Typography variant="h5" component="h2">
            Application activity
          </Typography>
          <List>
            {evidence.history.map((item, index) => (
              <ListItem key={index} divider>
                <ListItemText
                  primary={item.title}
                  secondary={
                    <>
                      {item.time}
                      {item.response && (
                        <>
                          <br />
                          {item.response}
                        </>
                      )}
                    </>
                  }
                />
              </ListItem>
            ))}
          </List>
          {evidence.more && <Typography variant="body2">Showing the latest 30 updates.</Typography>}
        </Paper>
      )}
    </Stack>
  );
}
