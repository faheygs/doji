import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { DojiTheme } from '@doji/ui';
import { AnnouncementForm } from './AnnouncementForm';
import { emptyAnnouncement, validateAnnouncement, type AnnouncementInput } from './announcement';

const now = Date.parse('2026-10-08T12:00:00Z');
const input: AnnouncementInput = {
  ...emptyAnnouncement,
  title: 'Hello',
  message: 'Welcome',
  timing: 'now',
  start: null,
  end: now + 3600000,
};
describe('announcement preview', () => {
  it('pins the revision loaded with edited fields despite background record refresh', async () => {
    const user = userEvent.setup();
    const prepare = vi.fn();
    const id = '20000000-0000-4000-8000-000000000005';
    const props = {
      initial: { ...input, end: Date.now() + 3600000 },
      submission: {
        intent: null,
        phase: 'idle' as const,
        message: '',
        prepare,
        confirm: vi.fn(),
        close: vi.fn(),
      },
    };
    const view = (version: string) => (
      <MemoryRouter>
        <DojiTheme>
          <AnnouncementForm {...props} target={{ id, version }} />
        </DojiTheme>
      </MemoryRouter>
    );
    const rendered = render(view('a'.repeat(32)));
    await user.clear(screen.getByRole('textbox', { name: 'Title' }));
    await user.type(screen.getByRole('textbox', { name: 'Title' }), 'My unsaved edit');
    rendered.rerender(view('b'.repeat(32)));
    await user.click(screen.getByRole('button', { name: 'Publish now' }));
    expect(prepare).toHaveBeenCalledWith(
      expect.objectContaining({
        p_version: 'a'.repeat(32),
        p_input: expect.objectContaining({ title: 'My unsaved edit' }),
      }),
    );
  });
  it('shows the content preview without exposing live actions', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <DojiTheme>
          <AnnouncementForm />
        </DojiTheme>
      </MemoryRouter>,
    );
    await user.type(screen.getByRole('textbox', { name: 'Title' }), 'A simple message');
    expect(screen.getByRole('heading', { name: 'A simple message' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save draft' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Publish now' })).toBeDisabled();
    expect(screen.queryByLabelText(/rationale/i)).not.toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: 'Schedule' }));
    expect(screen.getByRole('button', { name: 'Schedule' })).toBeDisabled();
    expect(screen.getByText(/Time zone:/)).toBeInTheDocument();
  });
  it('validates required copy and temporal ordering', () => {
    expect(validateAnnouncement(input, now).ok).toBe(true);
    expect(validateAnnouncement({ ...input, title: ' ' }, now).ok).toBe(false);
    expect(validateAnnouncement({ ...input, message: 'a'.repeat(601) }, now).ok).toBe(false);
    expect(validateAnnouncement({ ...input, end: null }, now).ok).toBe(false);
    expect(validateAnnouncement({ ...input, end: now }, now).ok).toBe(false);
    expect(validateAnnouncement({ ...input, timing: 'scheduled', start: null }, now).ok).toBe(
      false,
    );
    expect(validateAnnouncement({ ...input, timing: 'scheduled', start: now - 1 }, now).ok).toBe(
      false,
    );
    expect(
      validateAnnouncement({ ...input, timing: 'scheduled', start: now + 60000 }, now),
    ).toMatchObject({
      ok: true,
      value: { startsAt: '2026-10-08T12:01:00.000Z', endsAt: '2026-10-08T13:00:00.000Z' },
    });
  });
  it('previews the complete immutable publication without exposing a live confirmation', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <DojiTheme>
          <AnnouncementForm
            initial={{
              ...input,
              end: Date.now() + 3600000,
              ctaLabel: 'Suggest',
              ctaUrl: '/(app)/suggest-challenge',
              reward: 'submit_idea',
              sparks: 50,
            }}
          />
        </DojiTheme>
      </MemoryRouter>,
    );
    expect(screen.getByRole('spinbutton', { name: 'Sparks per completion' })).toHaveValue(50);
    await user.click(screen.getByRole('button', { name: 'Validate preview' }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText(/50 Sparks per qualifying/)).toBeInTheDocument();
    expect(screen.getByText(/server accepts publication/)).toBeInTheDocument();
    expect(screen.getByText(/Nothing will be saved/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Back to editing' }));
    expect(await screen.findByRole('spinbutton', { name: 'Sparks per completion' })).toHaveValue(
      50,
    );
  });
  it('can review a draft without labelling it scheduled and preserves edits after dismissal', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <DojiTheme>
          <AnnouncementForm
            initial={{
              ...input,
              end: Date.now() + 3600000,
            }}
          />
        </DojiTheme>
      </MemoryRouter>,
    );
    await user.click(screen.getByRole('button', { name: 'Preview draft save' }));
    expect(await screen.findByRole('heading', { name: 'Review draft' })).toBeInTheDocument();
    expect(screen.getByText(/does not make it visible/)).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(await screen.findByRole('textbox', { name: 'Title' })).toHaveValue('Hello');
  });
});
