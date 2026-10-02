import { FALLBACK_AVATAR_GRADIENT, lightColors, darkColors } from '../../constants/theme';
import { normalizePublicProfile, parsePublicProfileView } from '../../lib/publicProfileView';
import { PUBLIC_PROFILE_COLUMNS, embeddedPublicProfile } from '../../lib/profileFields';
import {
  getEquippedBorder,
  getEquippedTitleLabel,
  resolveAvatarBorderColor,
  resolveAvatarBorderWidth,
} from '../../lib/cosmetics';
import { getRankTitle, getRankBorderColor } from '../../lib/rankTitle';
import { isBadgeTierUpgrade, tiersUnlockedUpTo } from '../../lib/badgeCelebration';
import { mapSuggestionKindToChallengeRow } from '../../lib/challengeSuggestions';
import { hashSuggestionBody } from '../../lib/hashString';
import { reactionEmojiIconColors } from '../../lib/reactionColors';
import { legalAcceptanceMetadata } from '../../lib/legal';
import { showProfilePhotoDialog } from '../../lib/profilePhotoDialog';

test.each([null, undefined, false, '', 42, {}, { id: 'p' }, { username: 'person' }])(
  'incomplete profile %p is not renderable',
  (value) => {
    expect(normalizePublicProfile(value)).toBeNull();
  },
);
test.each([undefined, null, [], ['#111'], 'invalid'])(
  'invalid avatar gradient %p gets a fresh fallback',
  (avatar_gradient) => {
    const profile = normalizePublicProfile({ id: 'p', username: 'person', avatar_gradient });
    expect(profile?.avatar_gradient).toEqual(FALLBACK_AVATAR_GRADIENT);
    expect(profile?.avatar_gradient).not.toBe(FALLBACK_AVATAR_GRADIENT);
  },
);
test('authorized profile retains supplied presentation, while blocked status discards even supplied data', () => {
  const profile = { id: 'p', username: 'person', avatar_gradient: ['#111', '#222'] };
  expect(normalizePublicProfile(profile)).toBe(profile);
  expect(parsePublicProfileView({ status: 'visible', profile })).toEqual({
    status: 'visible',
    profile,
  });
  expect(parsePublicProfileView({ status: 'blocked_by_user', profile })).toEqual({
    status: 'blocked_by_user',
    profile: null,
  });
});
test.each([
  null,
  undefined,
  1,
  '',
  {},
  { status: 'unknown', profile: {} },
  { status: 'visible' },
  { status: 'visible', profile: 'private' },
])('malformed access envelope %p fails closed', (value) => {
  expect(parsePublicProfileView(value)).toEqual({ status: 'not_found', profile: null });
});
test('public embed contains the explicit safe columns and no account authority or private fields', () => {
  expect(embeddedPublicProfile('author')).toBe(`author:profiles(${PUBLIC_PROFILE_COLUMNS})`);
  expect(embeddedPublicProfile('owner', 'profiles!posts_user_id_fkey')).toBe(
    `owner:profiles!posts_user_id_fkey(${PUBLIC_PROFILE_COLUMNS})`,
  );
  const columns = PUBLIC_PROFILE_COLUMNS.split(',');
  for (const privateField of [
    'email',
    'sparks',
    'is_admin',
    'is_banned',
    'expo_push_token',
    'birth_date',
    '*',
  ])
    expect(columns).not.toContain(privateField);
  expect(columns).toEqual(
    expect.arrayContaining(['id', 'username', 'equipped_border_key', 'equipped_title_key']),
  );
});
test.each([null, undefined, { equipped_border_key: null }, { equipped_border_key: 'missing' }])(
  'absent or unknown equipped border %p preserves rank fallback',
  (profile) => {
    expect(getEquippedBorder(profile)).toBeNull();
    expect(resolveAvatarBorderColor(profile, 'rank')).toBe('rank');
    expect(resolveAvatarBorderColor(profile)).toBeUndefined();
    expect(resolveAvatarBorderWidth(profile)).toBe(2.5);
  },
);
test('equipped cosmetic wins over rank without changing ownership or pricing', () => {
  const profile = { equipped_border_key: 'border_gold' };
  expect(getEquippedBorder(profile)).toEqual({
    key: 'border_gold',
    color: '#FFD700',
    width: 3,
    label: 'Gold',
  });
  expect(resolveAvatarBorderColor(profile, 'rank')).toBe('#FFD700');
  expect(resolveAvatarBorderWidth(profile)).toBe(3);
  expect(getEquippedTitleLabel({ equipped_title_key: 'title_early_bird' })).toBe('Chaos Agent');
});
test.each([null, undefined, { equipped_title_key: null }, { equipped_title_key: 'unknown' }])(
  'no fabricated title for %p',
  (profile) => expect(getEquippedTitleLabel(profile)).toBeNull(),
);
test.each([
  [0, 'Rookie', 'border'],
  [1, 'Rookie', 'border'],
  [2, 'Rookie', 'border'],
  [3, 'Challenger', 'primary'],
  [5, 'Challenger', 'primary'],
  [6, 'Competitor', 'accent'],
  [9, 'Competitor', 'accent'],
  [10, 'Veteran', 'warning'],
  [14, 'Veteran', 'warning'],
  [15, 'Legend', 'xpGradientStart'],
  [100, 'Legend', 'xpGradientStart'],
] as const)('rank level %i uses %s in both themes', (level, title, token) => {
  expect(getRankTitle(level)).toBe(title);
  for (const colors of [lightColors, darkColors])
    expect(getRankBorderColor(level, colors)).toBe(colors[token]);
});
test.each([
  ['bronze', ['bronze']],
  ['silver', ['bronze', 'silver']],
  ['gold', ['bronze', 'silver', 'gold']],
  ['diamond', ['bronze', 'silver', 'gold', 'diamond']],
  ['future', ['future']],
])('unlocked tiers through %s remain ordered', (tier, expected) =>
  expect(tiersUnlockedUpTo(tier as string)).toEqual(expected),
);
test.each([
  [null, null, false],
  ['bronze', undefined, false],
  [undefined, 'bronze', true],
  ['bronze', 'silver', true],
  ['diamond', 'gold', false],
  ['gold', 'gold', false],
  ['future', 'future', false],
  ['future', 'gold', true],
  ['gold', 'future', true],
] as const)(
  'badge transition %p -> %p celebrates only an upgrade/change',
  (oldTier, newTier, expected) => expect(isBadgeTierUpgrade(oldTier, newTier)).toBe(expected),
);
test.each([
  ['poll', 'poll', 'social', false, false],
  ['wyr', 'poll', 'social', false, false],
  ['question', 'task', 'mental', false, true],
  ['format_question', 'format', 'mental', false, true],
  ['photo_idea', 'photo', 'creative', true, false],
  ['legacy', 'task', 'mental', false, true],
] as const)(
  'suggestion %s maps its actual response contract',
  (kind, type, category, requires_photo, requires_text) => {
    expect(mapSuggestionKindToChallengeRow(kind)).toEqual({
      type,
      category,
      requires_photo,
      requires_text,
      requires_video: false,
    });
  },
);
test('suggestion hash normalizes only case and spacing deterministically', () => {
  expect(hashSuggestionBody('  Same\n IDEA  ')).toBe(hashSuggestionBody('same idea'));
  expect(hashSuggestionBody('same idea')).not.toBe(hashSuggestionBody('different idea'));
  expect(hashSuggestionBody('')).toBe('h1505');
});
test('reaction colors use the active theme, not a fixed local palette', () => {
  for (const c of [lightColors, darkColors])
    expect(reactionEmojiIconColors(c)).toEqual({
      fire: c.primary,
      like: c.success,
      dislike: c.textTertiary,
      laugh: c.warning,
      wow: c.accent,
      heart: c.error,
    });
});
test('legal metadata records both current document versions at the given acceptance time', () => {
  expect(legalAcceptanceMetadata('2026-10-01T12:00:00Z')).toEqual({
    terms_accepted_at: '2026-10-01T12:00:00Z',
    terms_version: '2026-08-20',
    privacy_accepted_at: '2026-10-01T12:00:00Z',
    privacy_version: '2026-08-20',
  });
});
test('profile photo choice defers camera/library actions until selected and cancel has no side effect', () => {
  const show = jest.fn(),
    camera = jest.fn(),
    library = jest.fn();
  showProfilePhotoDialog(show, camera, library);
  expect(camera).not.toHaveBeenCalled();
  expect(library).not.toHaveBeenCalled();
  const dialog = show.mock.calls[0][0];
  expect(dialog.layout).toBe('stacked');
  expect(dialog.actions.map((a: { label: string }) => a.label)).toEqual([
    'Take a picture',
    'Select a photo',
    'Cancel',
  ]);
  dialog.actions[0].onPress();
  dialog.actions[1].onPress();
  expect(camera).toHaveBeenCalledTimes(1);
  expect(library).toHaveBeenCalledTimes(1);
  expect(dialog.actions[2].onPress).toBeUndefined();
});
