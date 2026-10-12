import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Avatar,
  Box,
  Button,
  Chip,
  Divider,
  Link,
  Paper,
  Stack,
  Step,
  StepLabel,
  Stepper,
  TextField,
  Typography,
} from '@mui/material';
import type {
  BrandDetails,
  BusinessSetupCommand,
  BusinessSetupProfile,
} from '../../../../infra/portal-identity-candidate/business-setup-contract.mts';
import { failureText, type Client } from './business-runtime';
import { Workspace } from './BusinessWorkspace';
import { Loading } from './BusinessLoading';
import { prepareBusinessLogo } from './business-logo';
import type { BusinessFormState } from './BusinessLeaveGuard';

export function BusinessOnboarding({
  client,
  applicationRevision,
  reconciledAt,
  onFormState,
}: {
  client: Client;
  applicationRevision: number;
  reconciledAt?: number | null;
  onFormState?: (state: BusinessFormState) => void;
}) {
  const queries = useQueryClient();
  const [key] = useState(() => ['business-setup', crypto.randomUUID(), client.epoch()] as const);
  const [stage, setStage] = useState<'brand' | 'security'>('brand');
  const [draft, setDraft] = useState<BrandDetails>();
  const [baseRevision, setBaseRevision] = useState<number>();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [intent, setIntent] = useState<BusinessSetupCommand>();
  const [editing, setEditing] = useState(false);
  const [preparingLogo, setPreparingLogo] = useState(false);
  const active = useRef(false);
  const busy = useRef(false);
  const imageGeneration = useRef(0);
  const imageBusy = useRef(false);
  useEffect(() => {
    onFormState?.({ dirty: !!draft || !!intent, pending: pending || preparingLogo });
  }, [draft, intent, pending, preparingLogo, onFormState]);
  useEffect(
    () => () => {
      onFormState?.({ dirty: false, pending: false });
    },
    [onFormState],
  );
  const logoInput = useRef<HTMLInputElement>(null);
  const setup = useQuery({
    queryKey: [...key, 'profile'],
    queryFn: () => client.setup(),
    retry: false,
    gcTime: 0,
    staleTime: 0,
  });
  const complete = setup.data?.setup_complete === true && !editing;
  const dashboard = useQuery({
    queryKey: [...key, 'dashboard'],
    queryFn: () => client.dashboard(),
    enabled: complete && client.assurance() === 'aal2' && !setup.isError,
    retry: false,
    gcTime: 0,
    staleTime: 0,
  });
  useEffect(() => {
    active.current = true;
    const invalidateLogo = () => {
      imageGeneration.current++;
    };
    const refresh = () => {
      if (document.visibilityState === 'visible' && client.hasSession() && !busy.current)
        void queries.invalidateQueries({ queryKey: key });
    };
    const clear = client.onClear(() => {
      invalidateLogo();
      queries.removeQueries({ queryKey: key });
    });
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('online', refresh);
    return () => {
      active.current = false;
      invalidateLogo();
      clear();
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('online', refresh);
      void queries.cancelQueries({ queryKey: key });
      queries.removeQueries({ queryKey: key });
    };
  }, [client, key, queries]);
  useEffect(() => {
    void queries.invalidateQueries({ queryKey: key });
  }, [applicationRevision, reconciledAt, key, queries]);
  useEffect(() => {
    const leave = (event: BeforeUnloadEvent) => {
      if (draft || pending || intent || preparingLogo) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', leave);
    return () => window.removeEventListener('beforeunload', leave);
  }, [draft, pending, intent, preparingLogo]);
  const profile = setup.data;
  const stale = draft && profile && baseRevision !== profile.revision;
  function edit(patch: Partial<BrandDetails>) {
    if (!profile || busy.current || intent) return;
    setBaseRevision((value) => value ?? profile.revision);
    setDraft((value) => ({ ...(value ?? profile.details), ...patch }));
  }
  async function command(action: 'save' | 'complete', original?: BusinessSetupCommand) {
    if (busy.current || imageBusy.current || !profile || (!original && (intent || stale))) return;
    const current = original ?? {
      action,
      revision: profile.revision,
      details: action === 'save' ? { ...(draft ?? profile.details) } : null,
      requestId: crypto.randomUUID(),
    };
    const epoch = client.epoch();
    busy.current = true;
    setPending(true);
    setError('');
    setIntent(current);
    await queries.cancelQueries({ queryKey: key });
    try {
      const result = await client.setupCommand(current);
      if (!active.current || epoch !== client.epoch()) return;
      // A confirmed receipt is never resent because a subsequent read fails.
      setIntent(undefined);
      setDraft(undefined);
      setBaseRevision(undefined);
      queries.setQueryData([...key, 'profile'], result);
      if (current.action === 'save') setStage('security');
      else {
        setEditing(false);
        await queries.invalidateQueries({ queryKey: [...key, 'dashboard'] });
      }
    } catch (cause) {
      if (!active.current || epoch !== client.epoch()) return;
      const status =
        cause && typeof cause === 'object' && 'status' in cause ? cause.status : undefined;
      if ([400, 401, 403, 409, 429].includes(Number(status))) setIntent(undefined);
      setError(failureText(cause));
    } finally {
      busy.current = false;
      if (active.current && epoch === client.epoch()) setPending(false);
    }
  }
  async function uploadLogo(file: File) {
    if (busy.current || intent || imageBusy.current) return;
    const generation = ++imageGeneration.current,
      epoch = client.epoch();
    imageBusy.current = true;
    setPreparingLogo(true);
    setError('');
    try {
      const logo = await prepareBusinessLogo(file);
      if (active.current && generation === imageGeneration.current && epoch === client.epoch())
        edit({ logo });
    } catch (cause) {
      if (active.current && generation === imageGeneration.current && epoch === client.epoch())
        setError(failureText(cause));
    } finally {
      if (active.current && generation === imageGeneration.current && epoch === client.epoch()) {
        imageBusy.current = false;
        setPreparingLogo(false);
      }
    }
  }
  const retry = intent && (
    <Button disabled={pending} onClick={() => void command(intent.action, intent)}>
      Retry the same request
    </Button>
  );
  if (setup.isError)
    return (
      <Stack spacing={2}>
        <Alert severity="error">
          Business setup could not be checked. No access has been granted.
        </Alert>
        <Button onClick={() => void setup.refetch()}>Try again</Button>
        {retry}
      </Stack>
    );
  if (!profile) return <Loading />;
  if (complete && client.assurance() === 'aal2') {
    if (dashboard.isError)
      return (
        <Alert
          severity="error"
          action={<Button onClick={() => void dashboard.refetch()}>Try again</Button>}
        >
          Your workspace could not be loaded.
        </Alert>
      );
    return dashboard.data ? (
      <BusinessDashboard
        profile={dashboard.data}
        onEdit={() => {
          setEditing(true);
          setStage('brand');
        }}
      />
    ) : (
      <Loading />
    );
  }
  return (
    <Stack spacing={3}>
      <Box>
        <Chip color="success" label="Application approved" sx={{ mb: 2 }} />
        <Typography variant="h2" component="h1">
          Welcome, {profile.brand_name}.
        </Typography>
        <Typography color="text.secondary" sx={{ mt: 1 }}>
          Let’s get your business ready.
        </Typography>
      </Box>
      <Stepper activeStep={stage === 'brand' && !complete ? 0 : 1} alternativeLabel>
        <Step>
          <StepLabel>Your brand</StepLabel>
        </Step>
        <Step>
          <StepLabel>Secure your account</StepLabel>
        </Step>
        <Step>
          <StepLabel>Workspace</StepLabel>
        </Step>
      </Stepper>
      {error && (
        <Alert severity="error">
          {error}
          {retry}
        </Alert>
      )}
      {stale && (
        <Alert
          severity="warning"
          action={
            <Button
              onClick={() => {
                setDraft(undefined);
                setBaseRevision(undefined);
              }}
            >
              Load latest
            </Button>
          }
        >
          Your saved brand changed. Load the latest details before continuing.
        </Alert>
      )}
      {stage === 'brand' && !complete ? (
        <Paper variant="outlined" sx={{ p: { xs: 3, md: 4 } }}>
          <Stack
            component="form"
            spacing={3}
            onSubmit={(event) => {
              event.preventDefault();
              void command('save');
            }}
          >
            <Typography variant="h5" component="h2">
              Your brand
            </Typography>
            <Typography color="text.secondary">
              These details will be your defaults for future Dojis. Published Dojis won’t change.
            </Typography>
            <Stack direction="row" sx={{ gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
              <Avatar
                variant="rounded"
                src={(draft ?? profile.details).logo || undefined}
                alt={`${profile.brand_name} logo`}
                sx={{ width: 72, height: 72 }}
              >
                {profile.brand_name.slice(0, 1)}
              </Avatar>
              <Button
                variant="outlined"
                onClick={() => logoInput.current?.click()}
                disabled={pending || !!intent || preparingLogo}
              >
                {preparingLogo ? 'Preparing logo…' : 'Upload logo'}
              </Button>
              <input
                ref={logoInput}
                type="file"
                hidden
                accept="image/png,image/jpeg,image/webp"
                aria-label="Business logo"
                disabled={pending || !!intent || preparingLogo}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = '';
                  if (!file) return;
                  void uploadLogo(file);
                }}
              />
              {(draft ?? profile.details).logo && (
                <Button
                  disabled={pending || !!intent || preparingLogo}
                  onClick={() => {
                    imageGeneration.current++;
                    edit({ logo: '' });
                  }}
                >
                  Remove logo
                </Button>
              )}
              <Typography variant="body2" color="text.secondary">
                Optional · PNG, JPG or WebP · up to 5 MB
              </Typography>
            </Stack>
            <TextField
              label="Brand name"
              value={profile.brand_name}
              slotProps={{ input: { readOnly: true } }}
              helperText="From your approved application"
            />
            <TextField
              label="Business website"
              type="url"
              required
              value={(draft ?? profile.details).website}
              disabled={pending || !!intent}
              onChange={(e) => edit({ website: e.target.value })}
              slotProps={{ htmlInput: { maxLength: 500, pattern: 'https://.*' } }}
            />
            <TextField
              label="About your business"
              value={(draft ?? profile.details).description}
              disabled={pending || !!intent}
              onChange={(e) => edit({ description: e.target.value })}
              multiline
              minRows={3}
              slotProps={{ htmlInput: { maxLength: 300 } }}
              helperText="A short introduction, up to 300 characters"
            />
            <Stack direction="row" sx={{ gap: 3, flexWrap: 'wrap' }}>
              {(['primary_color', 'secondary_color'] as const).map((field) => (
                <TextField
                  key={field}
                  type="color"
                  sx={{ minWidth: 220, '& input': { width: '100%', height: 32 } }}
                  label={
                    field === 'primary_color' ? 'Primary brand color' : 'Secondary brand color'
                  }
                  value={(draft ?? profile.details)[field]}
                  disabled={pending || !!intent}
                  onChange={(e) => edit({ [field]: e.target.value })}
                  slotProps={{ inputLabel: { shrink: true } }}
                />
              ))}
            </Stack>
            <Divider />
            <Stack direction="row" sx={{ justifyContent: 'flex-end' }}>
              <Button
                type="submit"
                variant="contained"
                disabled={pending || !!intent || !!stale || preparingLogo}
              >
                {pending ? 'Saving…' : 'Save and continue'}
              </Button>
            </Stack>
          </Stack>
        </Paper>
      ) : (
        <>
          {!complete && (
            <Button
              sx={{ alignSelf: 'flex-start' }}
              disabled={pending || !!intent}
              onClick={() => setStage('brand')}
            >
              Back to brand details
            </Button>
          )}
          {!intent && (
            <Workspace
              client={client}
              onVerified={async () => {
                if (complete) {
                  await queries.invalidateQueries({ queryKey: key });
                  return;
                }
                await command('complete');
              }}
            />
          )}
        </>
      )}
    </Stack>
  );
}

function BusinessDashboard({
  profile,
  onEdit,
}: {
  profile: BusinessSetupProfile;
  onEdit: () => void;
}) {
  return (
    <Stack spacing={3}>
      <Stack direction="row" sx={{ alignItems: 'center', gap: 2 }}>
        <Avatar
          variant="rounded"
          src={profile.details.logo || undefined}
          alt={`${profile.brand_name} logo`}
          sx={{ width: 64, height: 64 }}
        >
          {profile.brand_name.slice(0, 1)}
        </Avatar>
        <Box>
          <Typography variant="h2" component="h1">
            {profile.brand_name}
          </Typography>
          <Typography color="text.secondary">Your business workspace</Typography>
        </Box>
      </Stack>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '2fr 1fr' }, gap: 3 }}>
        <Paper variant="outlined" sx={{ p: 3 }}>
          <Stack spacing={2}>
            <Typography variant="h5" component="h2">
              Brand profile
            </Typography>
            <Typography>
              {profile.details.description || 'Add a short introduction to your business.'}
            </Typography>
            <Link href={profile.details.website} target="_blank" rel="noopener noreferrer">
              {profile.details.website}
            </Link>
            <Stack direction="row" spacing={1}>
              <Chip label={profile.details.primary_color} />
              <Chip label={profile.details.secondary_color} />
            </Stack>
            <Button sx={{ alignSelf: 'flex-start' }} onClick={onEdit}>
              Edit brand profile
            </Button>
          </Stack>
        </Paper>
        <Paper variant="outlined" sx={{ p: 3 }}>
          <Stack spacing={2}>
            <Chip label="Account ready" color="success" sx={{ alignSelf: 'flex-start' }} />
            <Typography>Approved business · Owner access</Typography>
            <Typography color="text.secondary">Authenticator protection is on.</Typography>
            <Button href="mailto:support@dojipro.com" sx={{ alignSelf: 'flex-start' }}>
              Contact Doji
            </Button>
          </Stack>
        </Paper>
      </Box>
      <Paper variant="outlined" sx={{ p: 3 }}>
        <Typography variant="h5" component="h2">
          Your next Doji
        </Typography>
        <Typography color="text.secondary" sx={{ mt: 1 }}>
          Campaign publishing isn’t available yet. Your brand is ready for when it opens.
        </Typography>
      </Paper>
    </Stack>
  );
}
