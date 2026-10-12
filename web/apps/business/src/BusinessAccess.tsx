import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  FormControlLabel,
  Link,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { AccountCard } from '@doji/ui';
import { createBusinessVerification } from '../../../../website/business-portal/business-verification.mts';
import { failureText, type Runtime } from './business-runtime';
export function Access({ runtime: { client, config } }: { runtime: Runtime }) {
  const [params] = useSearchParams();
  const signup = params.get('mode') === 'register' && params.get('signin') !== 'failed';
  const registrationUntil = window.DOJI_REACT_BUSINESS_CONFIG?.registrationUntil;
  const registrationClosed =
    signup && registrationUntil !== undefined && !(Date.parse(registrationUntil) > Date.now());
  const mount = useRef<HTMLDivElement>(null);
  const verification = useRef<ReturnType<typeof createBusinessVerification>>(undefined);
  const alive = useRef(false);
  const busy = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(
    params.get('signin') === 'failed' ? 'Sign-in was not completed. Please try again.' : '',
  );
  useEffect(() => {
    alive.current = true;
    if (mount.current && !registrationClosed)
      verification.current = createBusinessVerification(
        mount.current,
        { ...config, publicAdmission: true },
        signup ? 'register' : 'signin',
      );
    return () => {
      alive.current = false;
      verification.current?.clear();
      verification.current = undefined;
    };
  }, [config, signup, registrationClosed]);
  if (registrationClosed)
    return (
      <AccountCard
        title="Business registration is currently closed"
        description="Existing business accounts can still sign in. Contact us if you’d like to introduce your business."
      >
        <Stack direction="row" sx={{ gap: 1, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Button href="?mode=signin" variant="contained">
            Sign in
          </Button>
          <Button href="mailto:support@dojipro.com?subject=Doji%20for%20Business">
            Contact Doji
          </Button>
        </Stack>
      </AccountCard>
    );
  return (
    <AccountCard
      title={signup ? 'Create your business account' : 'Welcome back'}
      description={
        signup
          ? 'Start with your email, then introduce your business.'
          : 'Sign in to continue your application or open your business workspace.'
      }
    >
      <Stack
        spacing={3}
        component="form"
        onSubmit={(event) => {
          event.preventDefault();
          if (busy.current || !verification.current) return;
          const data = new FormData(event.currentTarget);
          const epoch = client.epoch();
          busy.current = true;
          setPending(true);
          setError('');
          void (async () => {
            try {
              const evidence = verification.current!.fields();
              const destination = new URL(
                await client.signin({
                  signup,
                  proof: 'verificationToken' in evidence ? evidence.verificationToken : '',
                  ...(signup
                    ? {
                        termsAccepted: data.get('terms') === 'on',
                        privacyAcknowledged: data.get('privacy') === 'on',
                        country: 'US',
                        termsVersion: config.termsVersion,
                        privacyVersion: config.privacyVersion,
                      }
                    : {}),
                }),
              );
              destination.searchParams.set('login_hint', String(data.get('email') || '').trim());
              if (alive.current && epoch === client.epoch())
                window.location.assign(destination.href);
            } catch (error) {
              if (alive.current) {
                setError(failureText(error));
                void verification.current?.reset();
              }
            } finally {
              busy.current = false;
              if (alive.current) setPending(false);
            }
          })();
        }}
      >
        {error && <Alert severity="error">{error}</Alert>}
        <TextField
          label="Work email"
          type="email"
          name="email"
          autoComplete="email"
          required
          fullWidth
          disabled={pending}
        />
        {signup && (
          <Stack>
            <FormControlLabel
              control={<Checkbox name="terms" required disabled={pending} />}
              label={
                <>
                  I represent a United States business and accept the{' '}
                  <Link href={config.termsUrl} target="_blank" rel="noopener noreferrer">
                    business terms
                  </Link>
                  .
                </>
              }
            />
            <FormControlLabel
              control={<Checkbox name="privacy" required disabled={pending} />}
              label={
                <>
                  I acknowledge the{' '}
                  <Link href={config.privacyUrl} target="_blank" rel="noopener noreferrer">
                    privacy notice
                  </Link>
                  .
                </>
              }
            />
          </Stack>
        )}
        <Box ref={mount} />
        <Typography variant="body2" color="text.secondary">
          {signup
            ? 'Next, set up your password and verify your email on our secure sign-in page.'
            : 'Password recovery is available on the secure sign-in page.'}
        </Typography>
        <Button type="submit" variant="contained" disabled={pending} sx={{ alignSelf: 'center' }}>
          {pending ? 'Opening secure sign-in…' : 'Continue'}
        </Button>
        <Link
          href={signup ? '?mode=signin' : '?mode=register'}
          sx={{ alignSelf: 'center', textAlign: 'center' }}
        >
          {signup ? 'Already registered? Sign in' : 'New to Doji for Business? Register'}
        </Link>
      </Stack>
    </AccountCard>
  );
}
