import { prepareProfileHref, normalizeProfileUsername } from '../../lib/profileNavigation';
import { useAuthStore } from '../../stores/useAuthStore';
import { useProfileNavigationStore } from '../../stores/useProfileNavigationStore';
import type { Profile } from '../../types/database';

describe('profile navigation', () => {
  afterEach(() => {
    useAuthStore.setState({ profile: null });
    useProfileNavigationStore.getState().clear();
  });

  it('normalizes display handles before routing', () => {
    expect(normalizeProfileUsername('  @KiRa  ')).toBe('kira');
  });

  it('marks a different profile pending before returning its route', () => {
    const href = prepareProfileHref('@Kira', '/(app)/post/post-1');
    expect(href).toBe('/(app)/member/kira?returnTo=%2F(app)%2Fpost%2Fpost-1');
    expect(useProfileNavigationStore.getState().pendingUsername).toBe('kira');
  });

  it('routes the signed-in member to the profile tab without a pending member', () => {
    useAuthStore.setState({ profile: { id: 'me', username: 'owner' } as Profile });
    useProfileNavigationStore.getState().begin('stale');
    expect(prepareProfileHref('OWNER', '/(app)')).toBe('/(app)/profile');
    expect(useProfileNavigationStore.getState().pendingUsername).toBeNull();
  });
});
