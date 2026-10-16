import { render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { ConnectedAdmin } from './ConnectedAdmin';

vi.mock('@doji/portal-data/employee', () => ({ createEmployeeSession: () => ({}) }));
vi.mock('./EmployeeAccess', () => ({
  EmployeeAccess: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock('./ConnectedWorkspace', () => ({
  EmployeeWorkspace: ({ realtimeEnabled }: { realtimeEnabled: boolean }) => (
    <p>{realtimeEnabled ? 'Live updates enabled' : 'Live updates disabled'}</p>
  ),
}));
afterEach(() => vi.unstubAllGlobals());

it.each([
  ['https://admin-staging.dojipro.com', true],
  ['https://admin.dojipro.com', false],
])('identifies the environment at %s without exposing impersonation', async (origin, staging) => {
  vi.stubGlobal('location', { origin });
  render(<ConnectedAdmin config={{ independentEmployeeIdentity: true }} />);
  expect(await screen.findByText('Live updates disabled')).toBeVisible();
  const banner = screen.queryByRole('note', { name: 'Staging environment' });
  if (staging) expect(banner).toHaveTextContent('DOJI STAGE');
  else expect(banner).not.toBeInTheDocument();
  expect(screen.queryByText('Impersonate user')).not.toBeInTheDocument();
});

it.each([undefined, false, true])(
  'keeps realtime separate from workflow access: %s',
  async (realtime) => {
    vi.stubGlobal('location', { origin: 'https://admin-staging.dojipro.com' });
    render(
      <ConnectedAdmin
        config={{
          independentEmployeeIdentity: true,
          staffWorkflowEnabled: true,
          ...(realtime === undefined ? {} : { staffWorkflowRealtimeEnabled: realtime }),
        }}
      />,
    );
    expect(
      await screen.findByText(
        realtime === false ? 'Live updates disabled' : 'Live updates enabled',
      ),
    ).toBeVisible();
  },
);
