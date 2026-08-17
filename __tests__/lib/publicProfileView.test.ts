import { parsePublicProfileView } from '../../lib/publicProfileView';

describe('parsePublicProfileView', () => {
  it('discards all profile data when the target blocked the viewer', () => {
    expect(parsePublicProfileView({
      status: 'blocked_by_user',
      profile: { id: 'must-not-render', display_name: 'Hidden' },
    })).toEqual({ status: 'blocked_by_user', profile: null });
  });

  it('accepts a visible public profile', () => {
    const profile = { id: 'profile-id', username: 'kira' };
    expect(parsePublicProfileView({ status: 'visible', profile })).toEqual({
      status: 'visible',
      profile,
    });
  });

  it('normalizes malformed responses to not found', () => {
    expect(parsePublicProfileView(null)).toEqual({ status: 'not_found', profile: null });
    expect(parsePublicProfileView({ status: 'visible' })).toEqual({
      status: 'not_found', profile: null,
    });
  });
});
