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

  it('sends active legacy users to feed', () => {
    expect(resolveAuthenticatedRoute(mockSession(), mockProfile({ xp: 50 }))).toBe(ROUTES.feed);
  });
});

describe('isAuthRoutingPending', () => {
  it('is pending only when boot loading', () => {
    expect(isAuthRoutingPending(true, false)).toBe(true);
    expect(isAuthRoutingPending(true, true)).toBe(true);
    expect(isAuthRoutingPending(false, true)).toBe(false);
    expect(isAuthRoutingPending(false, false)).toBe(false);
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
    const gate = getAuthGate(false, false, mockSession(), null);
    expect(gate.canUseAuthGroup).toBe(true);
    expect(gate.mustFinishOnboarding).toBe(false);
    expect(gate.canUseApp).toBe(false);
  });

  it('allows onboarding for new profiles', () => {
    const gate = getAuthGate(false, false, mockSession(), mockProfile());
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
    );
    expect(gate.canUseApp).toBe(true);
    expect(gate.mustFinishOnboarding).toBe(false);
    expect(gate.canUseAuthGroup).toBe(false);
  });
});
