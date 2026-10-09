import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createEmployeeSession } from '@doji/portal-data/employee';
import { EmployeeAccess } from './EmployeeAccess';
import { DojiTheme } from '@doji/ui';

const employee = {
  user_id: '10000000-0000-4000-8000-000000000001',
  capabilities: { moderation_read: true },
};
const authenticated = {
  signedIn: true,
  assurance: 'aal2',
  csrf: 'c'.repeat(43),
  operator: employee,
};
describe('employee access UI', () => {
  it('never flashes a password form during restore and does not erase a password while typing', async () => {
    let finish!: (response: Response) => void;
    const upstream = vi.fn(
      async () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
    );
    const controller = createEmployeeSession(
      { independentEmployeeIdentity: true },
      { origin: 'https://admin.dojipro.com', upstream },
    );
    render(
      <DojiTheme>
        <EmployeeAccess controller={controller}>
          <div>Protected workspace</div>
        </EmployeeAccess>
      </DojiTheme>,
    );
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
    expect(screen.queryByLabelText(/Password/)).not.toBeInTheDocument();
    await waitFor(() => expect(finish).toBeTypeOf('function'));
    await act(async () => finish(Response.json({ message: 'Sign in' }, { status: 401 })));
    const input = await screen.findByLabelText(/Password/);
    fireEvent.change(input, { target: { value: 'synthetic-password' } });
    input.focus();
    fireEvent(window, new Event('online'));
    fireEvent(document, new Event('visibilitychange'));
    expect(screen.getByLabelText(/Password/)).toBe(input);
    expect(input).toHaveValue('synthetic-password');
    expect(input).toHaveFocus();
    expect(upstream).toHaveBeenCalledTimes(1);
  });
  it('completes independent password/MFA and clears private UI immediately on lock', async () => {
    const paths: string[] = [];
    const controller = createEmployeeSession(
      { independentEmployeeIdentity: true },
      {
        origin: 'https://admin.dojipro.com',
        upstream: async (url) => {
          paths.push(new URL(url).pathname);
          if (url.endsWith('/api/session')) return Response.json({}, { status: 401 });
          if (url.endsWith('/auth/start'))
            return Response.json({ step: 'totp', csrf: 'c'.repeat(43) });
          if (url.endsWith('/auth/complete')) return Response.json(authenticated);
          return Response.json({ signedIn: false });
        },
      },
    );
    render(
      <DojiTheme>
        <EmployeeAccess controller={controller}>
          <div>Protected workspace</div>
        </EmployeeAccess>
      </DojiTheme>,
    );
    fireEvent.change(await screen.findByLabelText(/Work email/), {
      target: { value: 'test@example.com' },
    });
    fireEvent.change(screen.getByLabelText(/Password/), {
      target: { value: 'synthetic-password' },
    });
    fireEvent.submit(screen.getByRole('button', { name: 'Sign in' }).closest('form')!);
    fireEvent.change(await screen.findByLabelText(/Authenticator code/), {
      target: { value: '123456' },
    });
    fireEvent.submit(screen.getByRole('button', { name: 'Verify and continue' }).closest('form')!);
    await screen.findByText('Protected workspace');
    await act(async () => {
      await controller.signOut();
    });
    expect(screen.queryByText('Protected workspace')).not.toBeInTheDocument();
    expect(screen.getByLabelText(/Password/)).toHaveValue('');
    expect(paths).toEqual(['/api/session', '/auth/start', '/auth/complete', '/auth/logout']);
  });
});
