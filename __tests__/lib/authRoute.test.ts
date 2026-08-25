import {
  resolveAuthenticatedRoute,
  isAuthRoutingPending,
  getAuthGate,
} from '../../lib/authRoute';
import { ROUTES } from '../../lib/routes';
import type { Profile } from '../../types/database';

function mockSession() {
  return { user: { id: 'u1' } } as Parameters<typeof resolveAuthenticatedRoute>[0];
}

function mockProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: 'u1',
    username: 'test',
    display_name: 'Test',
    avatar_url: null,
    avatar_gradient: ['#000', '#111'],
    bio: null,
    current_streak: 0,
    longest_streak: 0,
    total_completions: 0,
    total_missed: 0,
    xp: 0,
    level: 1,
    reactions_received: 0,
    streak_shields: 0,
    notification_token: null,
    app_theme: 'light',
    sparks: 0,
    accent_theme: 'doji_orange',
    appearance_mode: 'light',
    equipped_border_key: null,
    equipped_title_key: null,
    timezone: 'UTC',
    is_admin: false,
    is_banned: false,
    onboarding_completed_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

describe('resolveAuthenticatedRoute', () => {
  it('sends unauthenticated users to welcome', () => {
    expect(resolveAuthenticatedRoute(null, null)).toBe(ROUTES.welcome);
  });

  it('sends session without profile to username', () => {
    expect(resolveAuthenticatedRoute(mockSession(), null)).toBe(ROUTES.username);
  });

  it('sends brand-new users to how-it-works', () => {
    expect(resolveAuthenticatedRoute(mockSession(), mockProfile())).toBe(ROUTES.onboardingHowItWorks);
  });

  it('sends completed onboarding users to feed', () => {
    expect(
      resolveAuthenticatedRoute(
        mockSession(),
        mockProfile({ onboarding_completed_at: new Date().toISOString() }),
      ),
    ).toBe(ROUTES.feed);
  });

  it('sends banned users to the dedicated account screen', () => {
    expect(resolveAuthenticatedRoute(mockSession(), mockProfile({ is_banned: true }))).toBe(
      ROUTES.banned,
    );
  });

  it('sends active legacy users to feed', () => {
    expect(resolveAuthenticatedRoute(mockSession(), mockProfile({ xp: 50 }))).toBe(ROUTES.feed);
  });
});

describe('isAuthRoutingPending', () => {
  it('is pending during startup loading', () => {
    expect(isAuthRoutingPending(true, false, null, null)).toBe(true);
  });

  it('is pending while an authenticated profile initially hydrates', () => {
    expect(isAuthRoutingPending(false, true, mockSession(), null)).toBe(true);
  });

  it('does not become pending during an existing profile refresh', () => {
    expect(isAuthRoutingPending(false, false, mockSession(), mockProfile(), 'ready')).toBe(false);
  });

  it('is ready when signed out or profile hydration has finished', () => {
    expect(isAuthRoutingPending(false, false, null, null)).toBe(false);
    expect(isAuthRoutingPending(false, false, mockSession(), null, 'missing')).toBe(false);
  });
});

describe('getAuthGate', () => {
  it('blocks all groups until ready', () => {
    const gate = getAuthGate(true, false, mockSession(), mockProfile());
    expect(gate.ready).toBe(false);
    expect(gate.canUseApp).toBe(false);
    expect(gate.canUseAuthGroup).toBe(false);
  });

  it('allows auth group when signed out', () => {
    const gate = getAuthGate(false, false, null, null);
    expect(gate.canUseAuthGroup).toBe(true);
    expect(gate.canUseApp).toBe(false);
  });

  it('allows auth group for session without profile', () => {
    const gate = getAuthGate(false, false, mockSession(), null, 'missing');
    expect(gate.canUseAuthGroup).toBe(true);
    expect(gate.mustFinishOnboarding).toBe(false);
    expect(gate.canUseApp).toBe(false);
  });

  it('blocks auth routes while the authenticated profile initially hydrates', () => {
    const gate = getAuthGate(false, true, mockSession(), null);
    expect(gate.ready).toBe(false);
    expect(gate.canUseAuthGroup).toBe(false);
    expect(gate.canUseApp).toBe(false);
  });

  it('keeps the auth gate closed while an existing profile is re-authorized', () => {
    const gate = getAuthGate(
      false,
      true,
      mockSession(),
      mockProfile({ onboarding_completed_at: new Date().toISOString() }),
      'ready',
    );
    expect(gate.ready).toBe(false);
    expect(gate.canUseApp).toBe(false);
  });

  it('allows onboarding for new profiles', () => {
    const gate = getAuthGate(false, false, mockSession(), mockProfile(), 'ready');
    expect(gate.mustFinishOnboarding).toBe(true);
    expect(gate.canUseApp).toBe(false);
    expect(gate.canUseAuthGroup).toBe(false);
  });

  it('allows app for onboarded users', () => {
    const gate = getAuthGate(
      false,
      false,
      mockSession(),
      mockProfile({ onboarding_completed_at: new Date().toISOString() }),
      'ready',
    );
    expect(gate.canUseApp).toBe(true);
    expect(gate.mustFinishOnboarding).toBe(false);
    expect(gate.canUseAuthGroup).toBe(false);
  });

  it('allows only the banned screen for a banned profile', () => {
    const gate = getAuthGate(
      false,
      false,
      mockSession(),
      mockProfile({ is_banned: true, onboarding_completed_at: new Date().toISOString() }),
      'ready',
    );
    expect(gate.isBanned).toBe(true);
    expect(gate.canUseBannedScreen).toBe(true);
    expect(gate.canUseApp).toBe(false);
    expect(gate.canUseAuthGroup).toBe(false);
    expect(gate.mustFinishOnboarding).toBe(false);
  });
});
