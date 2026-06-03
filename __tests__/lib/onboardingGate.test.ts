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

// ---------------------------------------------------------------------------
// needsOnboarding
// ---------------------------------------------------------------------------
describe('needsOnboarding', () => {
  it('returns true for brand-new profile', () => {
    expect(needsOnboarding(mockProfile())).toBe(true);
  });

  it('returns false for null', () => {
    expect(needsOnboarding(null)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(needsOnboarding(undefined)).toBe(false);
  });

  it('skips onboarding when already completed', () => {
    expect(
      needsOnboarding(mockProfile({ onboarding_completed_at: new Date().toISOString() })),
    ).toBe(false);
  });

  it('skips onboarding for users with completions', () => {
    expect(needsOnboarding(mockProfile({ total_completions: 1 }))).toBe(false);
    expect(needsOnboarding(mockProfile({ total_completions: 100 }))).toBe(false);
  });

  it('skips onboarding for users with missed events', () => {
    expect(needsOnboarding(mockProfile({ total_missed: 1 }))).toBe(false);
  });

  it('skips onboarding for users with XP', () => {
    expect(needsOnboarding(mockProfile({ xp: 1 }))).toBe(false);
  });

  it('skips onboarding for accounts older than one day', () => {
    const old = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    expect(needsOnboarding(mockProfile({ created_at: old }))).toBe(false);
  });

  it('requires onboarding for account created minutes ago', () => {
    const recent = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    expect(needsOnboarding(mockProfile({ created_at: recent }))).toBe(true);
  });

  // Supabase format — the fix we made ensures parseDate is used
  it('accepts Supabase space-format created_at (recent account)', () => {
    const recent = new Date(Date.now() - 5 * 60_000)
      .toISOString()
      .replace('T', ' ')
      .replace('Z', '+00');
    expect(needsOnboarding(mockProfile({ created_at: recent }))).toBe(true);
  });

  it('accepts Supabase space-format created_at (old account)', () => {
    const old = '2024-01-01 00:00:00+00';
    expect(needsOnboarding(mockProfile({ created_at: old }))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// shouldAutoCompleteOnboarding
// ---------------------------------------------------------------------------
describe('shouldAutoCompleteOnboarding', () => {
  it('returns false for brand-new user (still needs onboarding)', () => {
    expect(shouldAutoCompleteOnboarding(mockProfile())).toBe(false);
  });

  it('returns false when onboarding already completed', () => {
    expect(
      shouldAutoCompleteOnboarding(
        mockProfile({ onboarding_completed_at: new Date().toISOString() }),
      ),
    ).toBe(false);
  });

  it('returns true for old accounts without completions', () => {
    const old = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    expect(shouldAutoCompleteOnboarding(mockProfile({ created_at: old }))).toBe(true);
  });

  it('returns true for users with activity but no onboarding flag', () => {
    expect(shouldAutoCompleteOnboarding(mockProfile({ total_completions: 5 }))).toBe(true);
  });
});
