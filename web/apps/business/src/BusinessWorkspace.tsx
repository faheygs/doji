import { useEffect, useRef, useState } from 'react';
import { Alert, Box, Button, Paper, Stack, TextField, Typography } from '@mui/material';
import { failureText, type Client } from './business-runtime';
export function Workspace({
  client,
  onVerified,
}: {
  client: Client;
  onVerified?: () => Promise<void>;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [challenge, setChallenge] = useState(false);
  const [secret, setSecret] = useState('');
  const [qrCode, setQrCode] = useState('');
  const [manual, setManual] = useState(false);
  const [workspace, setWorkspace] = useState<{ brand: string; role: string }>();
  const alive = useRef(false);
  const busy = useRef(false);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  async function run(action: () => Promise<void>) {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setError('');
    try {
      await action();
    } catch (error) {
      if (alive.current) {
        setError(failureText(error));
        setChallenge(false);
        setSecret('');
        setQrCode('');
        setManual(false);
      }
    } finally {
      busy.current = false;
      if (alive.current) setPending(false);
    }
  }
  const show = async () => {
    const epoch = client.epoch();
    if (onVerified) {
      setChallenge(false);
      setSecret('');
      setQrCode('');
      setManual(false);
      await onVerified();
      return;
    }
    const result = await client.workspace();
    if (alive.current && epoch === client.epoch()) {
      setWorkspace(result);
      setChallenge(false);
      setSecret('');
      setQrCode('');
      setManual(false);
    }
  };
  return (
    <Paper variant="outlined" sx={{ p: 3 }}>
      <Stack spacing={2} sx={{ '& > .MuiButton-root': { alignSelf: 'flex-start' } }}>
        <Typography variant="h5" component="h2">
          {onVerified ? 'Secure your account' : 'Business workspace'}
        </Typography>
        {error && <Alert severity="error">{error}</Alert>}
        {workspace ? (
          <>
            <Typography>
              {workspace.brand} · {workspace.role}
            </Typography>
            <Typography color="text.secondary">
              Your workspace is ready. Campaign publishing and billing are not open yet.
            </Typography>
            <Button href="mailto:support@dojipro.com">Discuss next steps</Button>
          </>
        ) : challenge ? (
          <Stack
            component="form"
            spacing={2}
            onSubmit={(event) => {
              event.preventDefault();
              const code = String(new FormData(event.currentTarget).get('code') || '').trim();
              event.currentTarget.reset();
              void run(async () => {
                await client.verifyFactor('server-bound-challenge', code);
                if (alive.current) await show();
              });
            }}
          >
            {secret && (
              <>
                <Typography>
                  Scan this code in your authenticator app, then enter the six-digit code it shows.
                </Typography>
                {qrCode && (
                  <Box
                    component="img"
                    src={qrCode}
                    alt="Scan to add Doji for Business to your authenticator"
                    sx={{ width: 200, height: 200, alignSelf: 'flex-start' }}
                    onError={() => setQrCode('')}
                  />
                )}
                <Button onClick={() => setManual(!manual)} sx={{ alignSelf: 'flex-start' }}>
                  Can’t scan the code?
                </Button>
                {(manual || !qrCode) && (
                  <>
                    <Typography variant="body2">
                      Choose “Enter a setup key” in your authenticator. Use a time-based code.
                    </Typography>
                    <Typography component="code" sx={{ overflowWrap: 'anywhere' }}>
                      {secret}
                    </Typography>
                  </>
                )}
              </>
            )}
            <TextField
              name="code"
              label="Authenticator code"
              autoComplete="one-time-code"
              required
              disabled={pending}
              slotProps={{ htmlInput: { inputMode: 'numeric', pattern: '[0-9]{6}', maxLength: 6 } }}
            />
            <Button
              type="submit"
              variant="contained"
              disabled={pending}
              sx={{ alignSelf: 'flex-start' }}
            >
              {onVerified ? 'Verify and finish setup' : 'Verify and open workspace'}
            </Button>
            <Button
              disabled={pending}
              sx={{ alignSelf: 'flex-start' }}
              onClick={() => {
                setChallenge(false);
                setSecret('');
                setQrCode('');
                setManual(false);
              }}
            >
              Cancel
            </Button>
            <Typography variant="body2">
              Lost your authenticator? Contact support. A password reset does not remove MFA.
            </Typography>
          </Stack>
        ) : (
          <Button
            variant="contained"
            disabled={pending}
            onClick={() =>
              void run(async () => {
                if (client.assurance() === 'aal2') return show();
                const epoch = client.epoch();
                const factors = await client.factors();
                if (!alive.current || epoch !== client.epoch()) return;
                if (!factors.length) {
                  const enrolled = await client.enroll();
                  if (!alive.current || epoch !== client.epoch()) return;
                  setSecret(enrolled.totp.secret);
                  setQrCode(enrolled.totp.qrCode || '');
                }
                setChallenge(true);
              })
            }
          >
            {pending
              ? 'Checking access…'
              : onVerified
                ? 'Continue with authenticator'
                : 'Open business workspace'}
          </Button>
        )}
      </Stack>
    </Paper>
  );
}
