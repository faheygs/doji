import { needsOnboarding, shouldAutoCompleteOnboarding } from '../../lib/onboardingGate';
import type { Profile } from '../../types/database';

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

describe('onboardingGate', () => {
  it('needs onboarding for brand-new profile', () => {
    expect(needsOnboarding(mockProfile())).toBe(true);
  });

  it('skips onboarding when already completed', () => {
    expect(needsOnboarding(mockProfile({ onboarding_completed_at: new Date().toISOString() }))).toBe(
      false,
    );
  });

  it('skips onboarding for returning users with activity', () => {
    expect(needsOnboarding(mockProfile({ total_completions: 5 }))).toBe(false);
    expect(needsOnboarding(mockProfile({ xp: 100 }))).toBe(false);
  });

  it('skips onboarding for accounts older than one day', () => {
    const old = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    expect(needsOnboarding(mockProfile({ created_at: old }))).toBe(false);
  });

  it('shouldAutoCompleteOnboarding for legacy accounts', () => {
    const old = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    expect(shouldAutoCompleteOnboarding(mockProfile({ created_at: old }))).toBe(true);
    expect(shouldAutoCompleteOnboarding(mockProfile())).toBe(false);
  });
});
