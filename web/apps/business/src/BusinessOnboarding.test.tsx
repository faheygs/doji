import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import { createBusinessBrowserClient } from '../../../../infra/portal-identity/business-browser-client.mts';
import type {
  BusinessSetupCommand,
  BusinessSetupProfile,
} from '../../../../infra/portal-identity/business-setup-contract.mts';
import { BusinessOnboarding } from './BusinessOnboarding';
const qr = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==';
afterEach(() => vi.unstubAllGlobals());
async function fixture(
  options: { complete?: boolean; failSave?: boolean; failRead?: boolean; denied?: boolean } = {},
) {
  let assurance = 'aal1',
    readsFail = options.failRead,
    generation = 1;
  let profile: BusinessSetupProfile = {
    organization_id: '84000000-0000-4000-8000-000000000001',
    application_id: '83000000-0000-4000-8000-000000000001',
    role: 'owner',
    brand_name: 'Testing',
    revision: options.complete ? 2 : 0,
    setup_complete: options.complete === true,
    campaigns_enabled: false,
    billing_enabled: false,
    details: {
      website: 'https://example.com',
      description: '',
      primary_color: '#123456',
      secondary_color: '#ABCDEF',
      logo: '',
    },
  };
  const commands: BusinessSetupCommand[] = [],
    paths: string[] = [];
  const client = createBusinessBrowserClient(
    { enabled: true, realm: 'business', origin: 'https://business.dojipro.com' },
    async (url, init) => {
      const path = new URL(url).pathname;
      paths.push(path);
      if (path === '/api/session')
        return Response.json({ signedIn: true, csrf: 'a'.repeat(43), assurance });
      if (path === '/api/setup') {
        if (options.denied) return Response.json({}, { status: 403 });
        if (init.method === 'GET')
          return readsFail ? Response.json({}, { status: 503 }) : Response.json({ profile });
        const command = JSON.parse(String(init.body)) as BusinessSetupCommand;
        commands.push(command);
        if (options.failSave && commands.length === 1) throw Error('Connection lost');
        profile = {
          ...profile,
          revision: profile.revision + 1,
          details: command.details ?? profile.details,
          setup_complete: command.action === 'complete',
        };
        return Response.json({ profile });
      }
      if (path === '/auth/mfa/prepare')
        return Response.json(
          JSON.parse(String(init.body)).enroll
            ? { challengeReady: true, enrollmentSecret: 'ABCDEFGHIJKLMNOP', enrollmentQr: qr }
            : { enrollmentRequired: true },
        );
      if (path === '/auth/mfa/complete') {
        assurance = 'aal2';
        return Response.json({ assurance });
      }
      if (path === '/api/workspace') return Response.json({ profile });
      throw Error('Unexpected request: ' + path);
    },
  );
  await client.restore();
  const queries = new QueryClient({
    defaultOptions: {
      queries: { retry: false, refetchOnWindowFocus: false, refetchOnReconnect: false },
    },
  });
  const view = () => (
    <QueryClientProvider client={queries}>
      <BusinessOnboarding client={client} applicationRevision={generation} />
    </QueryClientProvider>
  );
  const ui = render(view());
  return {
    client,
    commands,
    paths,
    queries,
    ui,
    failNextRead: () => {
      readsFail = true;
      generation++;
      ui.rerender(view());
    },
  };
}
it('saves branding, shows QR with manual fallback, verifies and enters the actual owner workspace', async () => {
  const f = await fixture();
  await screen.findByRole('heading', { name: 'Welcome, Testing.' });
  expect(screen.getByLabelText(/Business website/)).toHaveValue('https://example.com');
  fireEvent.change(screen.getByLabelText(/About your business/), {
    target: { value: 'Our brand introduction' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save and continue' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Continue with authenticator' }));
  expect(await screen.findByRole('img', { name: /Scan to add/ })).toHaveAttribute('src', qr);
  expect(screen.queryByText('ABCDEFGHIJKLMNOP')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Can’t scan the code?' }));
  expect(screen.getByText('ABCDEFGHIJKLMNOP')).toBeVisible();
  fireEvent.change(screen.getByLabelText(/Authenticator code/), { target: { value: '123456' } });
  fireEvent.click(screen.getByRole('button', { name: 'Verify and finish setup' }));
  expect(await screen.findByText('Your business workspace')).toBeVisible();
  expect(screen.getByText('Our brand introduction')).toBeVisible();
  expect(screen.queryByRole('img', { name: /Scan to add/ })).toBeNull();
  expect(f.commands.map((command) => command.action)).toEqual(['save', 'complete']);
  expect(f.paths.filter((path) => path === '/api/workspace')).toHaveLength(1);
});
it('an ambiguous save keeps one exact request and prevents editing until deliberate retry', async () => {
  const f = await fixture({ failSave: true });
  fireEvent.click(await screen.findByRole('button', { name: 'Save and continue' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Retry the same request' }));
  await screen.findByRole('button', { name: 'Continue with authenticator' });
  expect(f.commands).toHaveLength(2);
  expect(f.commands[1]).toEqual(f.commands[0]);
});
it('completed setup still requires the current session MFA before workspace access', async () => {
  const f = await fixture({ complete: true });
  await screen.findByRole('button', { name: 'Continue with authenticator' });
  expect(f.paths).not.toContain('/api/workspace');
  expect(screen.queryByText('Your business workspace')).toBeNull();
});
it('a failed initial setup read is never presented as an empty editable profile', async () => {
  const f = await fixture({ failRead: true });
  await screen.findByText(/Business setup could not be checked/);
  expect(screen.queryByRole('button', { name: 'Save and continue' })).toBeNull();
  expect(f.paths).not.toContain('/api/workspace');
});
it('failed reconciliation hides previously read branding and prevents commands', async () => {
  const f = await fixture();
  await screen.findByRole('heading', { name: 'Welcome, Testing.' });
  act(() => f.failNextRead());
  await screen.findByText(/Business setup could not be checked/);
  expect(screen.queryByText('Welcome, Testing.')).toBeNull();
  expect(f.commands).toHaveLength(0);
});
it('authorization denial clears business client and session-scoped setup cache', async () => {
  const f = await fixture({ denied: true });
  await waitFor(() => expect(f.client.hasSession()).toBe(false));
  expect(f.commands).toHaveLength(0);
  f.ui.unmount();
  expect(f.queries.getQueryCache().getAll()).toHaveLength(0);
});

it('does not save while a selected logo is still being prepared', async () => {
  let rejectImage!: (error: Error) => void;
  vi.stubGlobal(
    'createImageBitmap',
    () =>
      new Promise((_resolve, reject) => {
        rejectImage = reject;
      }),
  );
  const f = await fixture();
  const save = await screen.findByRole('button', { name: 'Save and continue' });
  fireEvent.change(screen.getByLabelText('Business logo'), {
    target: { files: [new File(['synthetic'], 'logo.png', { type: 'image/png' })] },
  });
  expect(save).toBeDisabled();
  fireEvent.submit(save.closest('form')!);
  expect(f.commands).toHaveLength(0);
  await act(async () => {
    rejectImage(Error('Could not read image'));
  });
  expect(await screen.findByText('Could not read image')).toBeVisible();
  expect(save).toBeEnabled();
});
