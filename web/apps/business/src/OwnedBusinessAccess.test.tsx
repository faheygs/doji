import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { OwnedBusinessAccess, type AccessTransport } from './OwnedBusinessAccess';
import { BusinessPasswordRejected } from '../../../../infra/portal-identity/business-password-policy.mts';

function submit() {
  fireEvent.change(screen.getByLabelText(/Work email/), {
    target: { value: 'sample@example.com' },
  });
  const password = screen.getByLabelText(/^Password/, { selector: 'input' }) as HTMLInputElement;
  fireEvent.change(password, { target: { value: 'sample-password' } });
  fireEvent.submit(password.closest('form')!);
  return password;
}

it('clears a new password immediately and gives uncertain reset outcomes no retry button', async () => {
  const transport = vi.fn<AccessTransport>().mockResolvedValue({ step: 'reset-pending' });
  const onAuthenticated = vi.fn();
  render(
    <OwnedBusinessAccess
      initialStep="reset"
      transport={transport}
      onAuthenticated={onAuthenticated}
    />,
  );
  const field = screen.getByLabelText(/New password/) as HTMLInputElement;
  fireEvent.change(field, { target: { value: 'new-password' } });
  fireEvent.submit(field.closest('form')!);
  expect(field.value).toBe('');
  expect(
    await screen.findByRole('heading', { name: 'We couldn’t confirm your password update' }),
  ).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Update password' })).toBeNull();
  expect(screen.getByRole('link', { name: 'Contact support' })).toHaveAttribute(
    'href',
    'mailto:support@dojipro.com',
  );
  expect(onAuthenticated).not.toHaveBeenCalled();
  expect(transport.mock.calls[0]![1]).not.toHaveProperty('password');
});

it('keeps the standard code field usable after rejection and clears its value before retry', async () => {
  const transport = vi
    .fn<AccessTransport>()
    .mockResolvedValueOnce({ step: 'mfa', codeRejected: true })
    .mockResolvedValueOnce({ step: 'complete' });
  render(<OwnedBusinessAccess initialStep="mfa" transport={transport} onAuthenticated={vi.fn()} />);
  const field = screen.getByLabelText(/Authenticator code/) as HTMLInputElement;
  fireEvent.change(field, { target: { value: '000000' } });
  fireEvent.submit(field.closest('form')!);
  expect(field.value).toBe('');
  expect(await screen.findByRole('alert')).toHaveTextContent('That code wasn’t accepted');
  expect(screen.getByRole('button', { name: 'Verify code' })).toBeEnabled();
  fireEvent.change(field, { target: { value: '123456' } });
  fireEvent.submit(field.closest('form')!);
  expect(await screen.findByRole('button', { name: 'Continue to application' })).toBeEnabled();
  expect(transport).toHaveBeenCalledTimes(2);
});

it('clears credentials immediately, prevents duplicate submissions and hides raw errors', async () => {
  let reject!: (reason: unknown) => void;
  const transport = vi.fn<AccessTransport>(
    () =>
      new Promise((_, no) => {
        reject = no;
      }),
  );
  render(<OwnedBusinessAccess transport={transport} onAuthenticated={vi.fn()} />);
  const password = submit();
  expect(password.value).toBe('');
  fireEvent.submit(password.closest('form')!);
  await waitFor(() => expect(transport).toHaveBeenCalledTimes(1));
  const fields = transport.mock.calls[0]![1];
  await act(async () => reject(new Error('secret provider response')));
  expect(screen.getByRole('alert')).not.toHaveTextContent('secret provider');
  expect(fields).not.toHaveProperty('password');
  expect(password.value).toBe('');
});

it('aborts outstanding requests and ignores completion after unmount', async () => {
  let finish!: (value: { step: 'complete' }) => void;
  const transport = vi.fn<AccessTransport>(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const completed = vi.fn();
  const view = render(<OwnedBusinessAccess transport={transport} onAuthenticated={completed} />);
  submit();
  await waitFor(() => expect(transport).toHaveBeenCalledTimes(1));
  view.unmount();
  expect(transport.mock.calls[0]![2].aborted).toBe(true);
  await act(async () => finish({ step: 'complete' }));
  expect(completed).not.toHaveBeenCalled();
  expect(transport.mock.calls[0]![1]).not.toHaveProperty('password');
});

it('handles a synchronous adapter failure without leaving the form locked', async () => {
  const transport = vi.fn<AccessTransport>(() => {
    throw Error('private detail');
  });
  render(<OwnedBusinessAccess transport={transport} onAuthenticated={vi.fn()} />);
  submit();
  expect(await screen.findByRole('alert')).not.toHaveTextContent('private detail');
  expect(screen.getByRole('button', { name: /^Sign in$/ })).toBeEnabled();
});

it('explains password requirements before signup and validates locally without dispatch', async () => {
  const transport = vi.fn<AccessTransport>();
  render(
    <OwnedBusinessAccess initialStep="register" transport={transport} onAuthenticated={vi.fn()} />,
  );
  const field = screen.getByLabelText(/^Password/, { selector: 'input' }) as HTMLInputElement;
  expect(field).toHaveAccessibleDescription(/At least 10 characters.*Hard to guess/);
  expect(screen.queryByText(/10–256/)).toBeNull();
  fireEvent.change(field, { target: { value: 'tiny' } });
  fireEvent.submit(field.closest('form')!);
  expect(screen.getByRole('alert')).toHaveTextContent('Use at least 10 characters');
  expect(field).toHaveAttribute('aria-invalid', 'true');
  expect(field).toHaveFocus();
  expect(transport).not.toHaveBeenCalled();
  fireEvent.change(field, { target: { value: 'synthetic-longer-passphrase' } });
  expect(field).toHaveAttribute('aria-invalid', 'false');
});

it('shows a provider rejection beside the password, retaining email and consent, not secrets', async () => {
  const transport = vi
    .fn<AccessTransport>()
    .mockRejectedValue(new BusinessPasswordRejected('password_requirements'));
  render(
    <OwnedBusinessAccess initialStep="register" transport={transport} onAuthenticated={vi.fn()} />,
  );
  for (const checkbox of screen.getAllByRole('checkbox')) fireEvent.click(checkbox);
  const field = submit();
  expect(await screen.findByRole('alert')).toHaveTextContent('Try a less predictable password');
  await waitFor(() => expect(field).toHaveFocus());
  expect(field.value).toBe('');
  expect(field).toHaveAccessibleDescription(/Try a less predictable password/);
  expect(screen.getByLabelText(/Work email/)).toHaveValue('sample@example.com');
  for (const checkbox of screen.getAllByRole('checkbox')) expect(checkbox).toBeChecked();
  expect(transport).toHaveBeenCalledTimes(1);
  expect(transport.mock.calls[0]![1]).not.toHaveProperty('password');
});

it('reset explains requirements and prevents short passwords before consuming the link', () => {
  const transport = vi.fn<AccessTransport>();
  render(
    <OwnedBusinessAccess initialStep="reset" transport={transport} onAuthenticated={vi.fn()} />,
  );
  const field = screen.getByLabelText(/New password/);
  expect(field).toHaveAccessibleDescription(/At least 10 characters/);
  fireEvent.change(field, { target: { value: 'tiny' } });
  fireEvent.submit(field.closest('form')!);
  expect(screen.getByRole('alert')).toHaveTextContent('Use at least 10 characters');
  expect(transport).not.toHaveBeenCalled();
});

it('checks off real password criteria and reevaluates when the email changes', async () => {
  render(
    <OwnedBusinessAccess initialStep="register" transport={vi.fn()} onAuthenticated={vi.fn()} />,
  );
  const field = screen.getByLabelText(/^Password/, { selector: 'input' });
  fireEvent.change(screen.getByLabelText(/Work email/), {
    target: { value: 'sample@example.com' },
  });
  expect(screen.getByRole('listitem', { name: 'Hard to guess: Not met yet' })).toBeVisible();
  fireEvent.change(field, { target: { value: 'qwertyqwerty' } });
  expect(screen.getByRole('listitem', { name: 'At least 10 characters: Met' })).toBeVisible();
  expect(await screen.findByText('Try another word or a less familiar phrase.')).toBeVisible();
  expect(screen.getByRole('listitem', { name: 'Hard to guess: Not met yet' })).toBeVisible();
  fireEvent.change(field, { target: { value: 'velvet.orbit.jasper.harbor-57' } });
  expect(await screen.findByRole('listitem', { name: 'Hard to guess: Met' })).toBeVisible();
  expect(screen.getByRole('listitem', { name: 'Doesn’t include your email: Met' })).toBeVisible();
  fireEvent.change(field, { target: { value: 'prefix-sample@example.com-suffix' } });
  expect(
    screen.getByRole('listitem', { name: 'Doesn’t include your email: Not met yet' }),
  ).toBeVisible();
  fireEvent.change(screen.getByLabelText(/Work email/), {
    target: { value: 'different@example.com' },
  });
  expect(screen.getByRole('listitem', { name: 'Doesn’t include your email: Met' })).toBeVisible();
  fireEvent.change(field, { target: { value: '' } });
  expect(
    screen.getByRole('listitem', { name: 'At least 10 characters: Not met yet' }),
  ).toBeVisible();
  expect(screen.getByRole('listitem', { name: 'Hard to guess: Not met yet' })).toBeVisible();
});

it('keeps longer advice in keyboard-accessible contextual help, not the main form', async () => {
  render(
    <OwnedBusinessAccess initialStep="register" transport={vi.fn()} onAuthenticated={vi.fn()} />,
  );
  expect(screen.queryByText(/Aim for 12–16/)).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Password tips' }));
  expect(screen.getByRole('dialog', { name: 'Password tips' })).toBeVisible();
  expect(screen.getByText(/Aim for 12–16 characters, or use a longer passphrase/)).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Got it' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
});

it('does not show signup criteria or tips on sign in', () => {
  render(<OwnedBusinessAccess transport={vi.fn()} onAuthenticated={vi.fn()} />);
  expect(screen.queryByRole('list', { name: 'Password checklist' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Password tips' })).toBeNull();
});
