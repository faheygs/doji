import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Alert, Box, Stack } from '@mui/material';
import { OwnedBusinessAccess, type AccessStep, type AccessTransport } from './OwnedBusinessAccess';
import { createOwnedAccessTransport } from './owned-access-transport';
import { createBusinessVerification } from '../../../../website/business-portal/business-verification.mts';
import { Access } from './BusinessAccess';
import type { Runtime } from './business-runtime';
import { browserResetLink } from './browser-reset-link';
import { businessAcceptance } from './business-acceptance';

// Independent browser flag; backend and proxy remain separately gated/unmounted.
export function OwnedAccessConnected({
  runtime,
  onAuthenticated,
}: {
  runtime: Runtime;
  onAuthenticated: () => Promise<void>;
}) {
  const [params] = useSearchParams();
  const acceptance = businessAcceptance(
    window.DOJI_REACT_BUSINESS_CONFIG?.acceptanceUntil,
    params.get('mode'),
    Date.now(),
    window.DOJI_REACT_BUSINESS_CONFIG?.acceptanceExistingAccount,
  );
  const initialStep =
    params.get('mode') === 'reset'
      ? browserResetLink.available()
        ? 'reset'
        : 'reset-invalid'
      : params.get('mode') === 'register' || acceptance.register
        ? 'register'
        : 'signin';
  const cutoff = window.DOJI_REACT_BUSINESS_CONFIG?.registrationUntil;
  const canRegister = acceptance.configured
    ? acceptance.register
    : cutoff !== undefined && Date.parse(cutoff) > Date.now();
  const [step, setStep] = useState<AccessStep>(initialStep);
  const [error, setError] = useState('');
  const mount = useRef<HTMLDivElement>(null);
  const verification = useRef<ReturnType<typeof createBusinessVerification> | null>(null);
  const transport = useRef<ReturnType<typeof createOwnedAccessTransport> | null>(null);
  const alive = useRef(false);
  const opening = useRef(false);
  const activeStep = useRef(step);
  const closed = initialStep === 'register' && !canRegister;
  useEffect(() => {
    alive.current = true;
    const client = createOwnedAccessTransport(
      { ...runtime.config, enabled: true },
      {
        currentOrigin: window.location.origin,
        request: fetch,
        resetLink: browserResetLink,
        proof: async (action, signal) => {
          signal.throwIfAborted();
          if (activeStep.current !== action || !verification.current)
            throw Error('Security check unavailable');
          const evidence = verification.current.fields();
          if (!('verificationToken' in evidence) || typeof evidence.verificationToken !== 'string')
            throw Error('Security check unavailable');
          return evidence.verificationToken;
        },
      },
    );
    transport.current = client;
    return () => {
      alive.current = false;
      client.dispose();
      transport.current = null;
    };
  }, [runtime.config]);
  useEffect(() => {
    activeStep.current = step;
    if (step !== 'reset') browserResetLink.clear();
    if (
      !mount.current ||
      closed ||
      !['signin', 'register', 'verify', 'mfa', 'recover', 'reset'].includes(step)
    )
      return;
    const challenge = createBusinessVerification(
      mount.current,
      { ...runtime.config, publicAdmission: true },
      step,
    );
    verification.current = challenge;
    return () => {
      challenge.clear();
      verification.current = null;
    };
  }, [step, closed, runtime.config]);
  const send = useCallback<AccessTransport>(async (action, fields, signal) => {
    const current = transport.current;
    if (!current) throw Error('Business access unavailable');
    try {
      return await current.transport(action, fields, signal);
    } finally {
      if (alive.current && activeStep.current === action) void verification.current?.reset();
    }
  }, []);
  if (closed) return <Access runtime={runtime} />;
  return (
    <Stack spacing={2}>
      {error && <Alert severity="error">{error}</Alert>}
      <OwnedBusinessAccess
        initialStep={initialStep}
        transport={send}
        canRegister={canRegister}
        onStepChange={setStep}
        security={<Box ref={mount} />}
        onAuthenticated={() => {
          if (opening.current) return;
          opening.current = true;
          setError('');
          void onAuthenticated()
            .catch(() => {
              if (alive.current)
                setError('Your account could not be opened. Please reload to check your session.');
            })
            .finally(() => {
              opening.current = false;
            });
        }}
      />
    </Stack>
  );
}
