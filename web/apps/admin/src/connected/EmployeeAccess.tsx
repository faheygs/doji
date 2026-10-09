import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { QueryClientProvider } from '@tanstack/react-query';
import { VerificationCode } from '@doji/ui/verification-code';
import type { EmployeeSessionController } from '@doji/portal-data/employee';
import { attachEmployeeReconciliation } from './employee-reconciliation';

/** Stable restore gate; unrelated async readiness never replaces an active password field. */
export function EmployeeAccess({
  controller,
  children,
}: {
  controller: EmployeeSessionController;
  children: ReactNode;
}) {
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [enrollment, setEnrollment] = useState<{ qrCode: string; secret: string } | null>(null);
  const [enrollmentError, setEnrollmentError] = useState(false);
  useEffect(() => {
    void controller.restore();
    return attachEmployeeReconciliation(controller);
  }, [controller]);
  useEffect(() => {
    if (state.phase !== 'enroll') return;
    let active = true;
    void controller.enrollment().then(
      (value) => {
        if (active) setEnrollment(value);
      },
      () => {
        if (active) setEnrollmentError(true);
      },
    );
    return () => {
      active = false;
      setEnrollment(null);
      setEnrollmentError(false);
    };
  }, [controller, state.phase]);
  if (state.phase === 'ready' && state.cache)
    return <QueryClientProvider client={state.cache}>{children}</QueryClientProvider>;
  return (
    <Box component="main" sx={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', p: 3 }}>
      <Paper variant="outlined" sx={{ p: { xs: 3, sm: 4 }, width: '100%', maxWidth: 440 }}>
        <Typography component="h1" variant="h3">
          Doji Admin
        </Typography>
        <Typography color="text.secondary" sx={{ mt: 1, mb: 3 }}>
          Sign in with your independent employee account.
        </Typography>
        {state.message && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {state.message}
          </Alert>
        )}
        {state.phase === 'restoring' ? (
          <Stack role="status" sx={{ alignItems: 'center', gap: 2, py: 4 }}>
            <CircularProgress aria-label="Restoring employee session" />
            <Typography>Checking your session…</Typography>
          </Stack>
        ) : state.phase === 'cleanup-error' ? (
          <Button
            disabled={state.busy}
            variant="contained"
            onClick={() => void controller.signOut()}
          >
            Retry sign-out
          </Button>
        ) : state.phase === 'error' ? (
          <Button
            disabled={state.busy}
            variant="contained"
            onClick={() => void controller.restore()}
          >
            Retry session check
          </Button>
        ) : (
          <Stack
            component="form"
            sx={{ gap: 2 }}
            onSubmit={(event) => {
              event.preventDefault();
              if (state.phase === 'signed-out') {
                const secret = password;
                setPassword('');
                void controller.signIn(email, secret);
              } else {
                const verification = code;
                setCode('');
                void controller.verify(verification);
              }
            }}
          >
            {state.phase === 'signed-out' ? (
              <>
                <TextField
                  label="Work email"
                  name="username"
                  autoComplete="username"
                  type="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  disabled={state.busy}
                />
                <TextField
                  label="Password"
                  name="password"
                  autoComplete="current-password"
                  type="password"
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  disabled={state.busy}
                />
              </>
            ) : (
              <>
                {state.phase === 'enroll' &&
                  (enrollmentError ? (
                    <Alert severity="error">
                      Authenticator setup unavailable. Return to sign in.
                    </Alert>
                  ) : enrollment ? (
                    <>
                      <Typography>
                        Scan this QR code with your authenticator app, then enter its code.
                      </Typography>
                      <Box
                        component="img"
                        src={enrollment.qrCode}
                        alt="Employee authenticator enrollment QR code"
                        sx={{ width: 200, maxWidth: '100%', alignSelf: 'center' }}
                      />
                      <Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>
                        Setup key: {enrollment.secret}
                      </Typography>
                    </>
                  ) : (
                    <CircularProgress aria-label="Loading authenticator setup" />
                  ))}
                <VerificationCode
                  label="Authenticator code"
                  value={code}
                  onChange={setCode}
                  autoFocus
                  error={!!state.message}
                  helperText="Enter the 6-digit code from your authenticator. You can also paste it."
                  disabled={state.busy || (state.phase === 'enroll' && !enrollment)}
                />
              </>
            )}
            <Button
              type="submit"
              variant="contained"
              disabled={
                state.busy ||
                (state.phase !== 'signed-out' && code.length !== 6) ||
                (state.phase === 'enroll' && !enrollment)
              }
            >
              {state.busy
                ? 'Please wait…'
                : state.phase === 'signed-out'
                  ? 'Sign in'
                  : 'Verify and continue'}
            </Button>
            {state.phase !== 'signed-out' && (
              <Button
                disabled={state.busy}
                onClick={() => {
                  setCode('');
                  setEnrollment(null);
                  void controller.signOut();
                }}
              >
                Back to sign in
              </Button>
            )}
          </Stack>
        )}
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 3 }}>
          Employee access only. Your member-app account is separate.
        </Typography>
      </Paper>
    </Box>
  );
}
