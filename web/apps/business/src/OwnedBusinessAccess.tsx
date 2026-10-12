import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import {
  Alert,
  Button,
  Checkbox,
  FormControlLabel,
  Link,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { AccountCard, VerificationCode } from '@doji/ui';
import {
  businessPasswordIssue,
  businessPasswordMaximum,
  businessPasswordMessages,
  BusinessPasswordRejected,
} from '../../../../infra/portal-identity-candidate/business-password-policy.mts';
import { PasswordChecklist } from './PasswordChecklist';
import { usePasswordFeedback } from './usePasswordFeedback';

import type { AccessAction, AccessStep, AccessTransport } from './owned-access-contracts';
export type { AccessAction, AccessStep, AccessTransport } from './owned-access-contracts';
const copy: Record<AccessStep, [string, string]> = {
  signin: ['Welcome back', 'Sign in to your business account.'],
  register: ['Create your account', 'Start your business application with a secure account.'],
  verify: ['Check your email', 'Enter the verification code from your email to continue.'],
  recover: [
    'Forgot your password?',
    'We’ll email a reset link if an account matches your address.',
  ],
  'check-email': [
    'Check your inbox',
    'If an account matches that address, you’ll receive a password reset link.',
  ],
  reset: ['Choose a new password', 'Use a strong, unique password for your business account.'],
  'reset-done': [
    'Password updated',
    'Sign in again with your new password. Your authenticator stays enabled.',
  ],
  'reset-pending': [
    'We couldn’t confirm your password update',
    'Don’t submit another password change. Contact support so we can check the result. Never share your password or reset link.',
  ],
  'reset-invalid': [
    'Open your reset link again',
    'This page no longer has a usable reset link. Open the link from your email. If it has expired, request a new one from sign in.',
  ],
  mfa: ['Verify it’s you', 'Enter the six-digit code from your authenticator.'],
  complete: ['You’re ready', 'Your account is verified. Continue to your business application.'],
};
const labels: Record<AccessAction, string> = {
  signin: 'Sign in',
  register: 'Create account',
  verify: 'Verify email',
  recover: 'Send reset link',
  reset: 'Update password',
  mfa: 'Verify code',
};
export function OwnedBusinessAccess({
  initialStep = 'signin',
  transport,
  onAuthenticated,
  onStepChange,
  security,
  canRegister = true,
}: {
  initialStep?: AccessStep;
  transport: AccessTransport;
  onAuthenticated: () => void;
  onStepChange?: (step: AccessStep) => void;
  security?: ReactNode;
  canRegister?: boolean;
}) {
  const [step, setStep] = useState(initialStep);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const passwordInput = useRef<HTMLInputElement>(null);
  const passwordFeedback = usePasswordFeedback(passwordInput);
  const checklistId = useId();
  const active = useRef<AbortController | null>(null);
  const form = useRef<HTMLFormElement>(null);
  const revision = useRef(0);
  const [code, setCode] = useState('');
  const [email, setEmail] = useState('');
  useEffect(() => {
    onStepChange?.(step);
  }, [step, onStepChange]);
  useEffect(() => {
    if (passwordError && !pending) passwordInput.current?.focus();
  }, [passwordError, pending]);
  useEffect(
    () => () => {
      revision.current++;
      active.current?.abort();
      active.current = null;
    },
    [],
  );
  const go = (next: AccessStep) => {
    revision.current++;
    active.current?.abort();
    active.current = null;
    form.current?.reset();
    passwordFeedback.clear();
    setCode('');
    setError('');
    setPasswordError('');
    setPending(false);
    setStep(next);
  };
  const finished = [
    'complete',
    'check-email',
    'reset-done',
    'reset-pending',
    'reset-invalid',
  ].includes(step);
  const hasEmail = ['signin', 'register', 'recover'].includes(step);
  const hasPassword = ['signin', 'register', 'reset'].includes(step);
  return (
    <AccountCard title={copy[step][0]} description={copy[step][1]}>
      <Stack
        component="form"
        key={step}
        ref={form}
        spacing={2.5}
        onSubmit={(event) => {
          event.preventDefault();
          if (active.current || finished || (step === 'register' && !canRegister)) return;
          const data = new FormData(event.currentTarget);
          const action = step as AccessAction;
          const fields: Record<string, string | boolean> = {};
          if (hasEmail) fields.email = String(data.get('email') || '').trim();
          if (hasPassword) fields.password = String(data.get('password') || '');
          if (step === 'register' || step === 'reset') {
            const issue = businessPasswordIssue(
              String(fields.password),
              hasEmail ? String(fields.email) : undefined,
            );
            if (issue) {
              setError('');
              setPasswordError(businessPasswordMessages[issue]);
              delete fields.password;
              passwordInput.current?.focus();
              return; // No request, security proof consumption, reservation or reset-link consumption.
            }
          }
          if (step === 'verify' || step === 'mfa') fields.code = code;
          if (step === 'register') {
            fields.termsAccepted = data.get('terms') === 'on';
            fields.privacyAcknowledged = data.get('privacy') === 'on';
          }
          // Clear secrets immediately, including a rejected or ambiguous request.
          const password = event.currentTarget.elements.namedItem('password');
          if (password instanceof HTMLInputElement) password.value = '';
          passwordFeedback.clear();
          setCode('');
          setError('');
          setPasswordError('');
          setPending(true);
          const controller = new AbortController();
          active.current = controller;
          const generation = revision.current;
          void Promise.resolve()
            .then(() => transport(action, fields, controller.signal))
            .then((result) => {
              if (controller.signal.aborted || revision.current !== generation) return;
              setStep(result.step);
              if (result.codeRejected)
                setError('That code wasn’t accepted. Check your code and try again.');
            })
            .catch((failure: unknown) => {
              if (!controller.signal.aborted && revision.current === generation) {
                if (action === 'register' && failure instanceof BusinessPasswordRejected)
                  setPasswordError(businessPasswordMessages[failure.code]);
                else if (action === 'reset')
                  setError(
                    'Check the security verification and open your email link again if needed. Your password update was not submitted.',
                  );
                else
                  setError(
                    'We couldn’t complete that step. Please try again, or return to sign in.',
                  );
              }
            })
            .finally(() => {
              // The request owns these fields; never retain credentials after completion.
              delete fields.password;
              delete fields.code;
              if (active.current === controller) {
                active.current = null;
                setPending(false);
              }
            });
        }}
      >
        {error && <Alert severity="error">{error}</Alert>}
        {hasEmail && (
          <TextField
            name="email"
            label="Work email"
            type="email"
            autoComplete="email"
            required
            fullWidth
            disabled={pending}
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (step === 'register') passwordFeedback.refresh(e.target.value);
            }}
          />
        )}
        {hasPassword && (
          <Stack spacing={1}>
            <TextField
              name="password"
              label={step === 'reset' ? 'New password' : 'Password'}
              type="password"
              autoComplete={step === 'signin' ? 'current-password' : 'new-password'}
              required
              fullWidth
              disabled={pending}
              inputRef={passwordInput}
              error={Boolean(passwordError)}
              helperText={passwordError || undefined}
              onFocus={() => {
                if (step !== 'signin') passwordFeedback.refresh(email);
              }}
              onBlur={() => {
                if (step !== 'signin') passwordFeedback.refresh(email);
              }}
              onChange={() => {
                if (passwordError) setPasswordError('');
                if (step !== 'signin') passwordFeedback.refresh(email);
              }}
              slotProps={{
                htmlInput: {
                  maxLength: businessPasswordMaximum,
                  ...(step !== 'signin' && !passwordError
                    ? { 'aria-describedby': checklistId }
                    : {}),
                },
                formHelperText: { role: passwordError ? 'alert' : undefined },
              }}
            />
            {step !== 'signin' && (
              <PasswordChecklist
                id={checklistId}
                feedback={passwordFeedback.feedback}
                showEmail={step === 'register'}
              />
            )}
          </Stack>
        )}
        {(step === 'verify' || step === 'mfa') && (
          <VerificationCode
            label={step === 'mfa' ? 'Authenticator code' : 'Email verification code'}
            value={code}
            onChange={setCode}
            disabled={pending}
          />
        )}
        {step === 'register' && (
          <Stack spacing={1}>
            <FormControlLabel
              control={<Checkbox name="terms" required disabled={pending} />}
              label={
                <>
                  I represent a United States business and accept the{' '}
                  <Link
                    href="https://business.dojipro.com/business-terms/"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
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
                  <Link
                    href="https://business.dojipro.com/business-privacy/"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    privacy notice
                  </Link>
                  .
                </>
              }
            />
          </Stack>
        )}
        {step === 'signin' && (
          <Button type="button" sx={{ alignSelf: 'flex-end' }} onClick={() => go('recover')}>
            Forgot password?
          </Button>
        )}
        {!finished && security}
        {step === 'reset-pending' && (
          <Button
            href="mailto:support@dojipro.com"
            variant="contained"
            sx={{ alignSelf: 'center' }}
          >
            Contact support
          </Button>
        )}
        {!finished && (
          <Button type="submit" variant="contained" disabled={pending} sx={{ alignSelf: 'center' }}>
            {pending ? 'Please wait…' : labels[step as AccessAction]}
          </Button>
        )}
        {step === 'complete' ? (
          <Button variant="contained" sx={{ alignSelf: 'center' }} onClick={onAuthenticated}>
            Continue to application
          </Button>
        ) : step !== 'signin' || canRegister ? (
          <Stack direction="row" sx={{ justifyContent: 'center', flexWrap: 'wrap', gap: 1 }}>
            <Button
              disabled={pending}
              onClick={() => go(step === 'signin' ? 'register' : 'signin')}
            >
              {step === 'signin' ? 'Create an account' : 'Back to sign in'}
            </Button>
          </Stack>
        ) : null}
        {step === 'mfa' && (
          <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center' }}>
            Lost your authenticator? <Link href="mailto:support@dojipro.com">Contact support</Link>.
          </Typography>
        )}
      </Stack>
    </AccountCard>
  );
}
