import React from 'react';
import { render } from '@testing-library/react-native';
import {
  DojiContributorCredit,
  ConnectedDojiContributorCredit,
} from '../../components/challenge/DojiContributorCredit';
import { DojiContributorHero } from '../../components/challenge/DojiContributorHero';
import { ChallengeTypeGlyph } from '../../components/challenge/ChallengeTypeGlyph';
import { ProfileAvatar } from '../../components/ui/ProfileAvatar';
import { Text } from '../../components/ui/Text';
import { lightColors, darkColors } from '../../constants/theme';
let mockColors = lightColors;
const author = {
  id: 'author',
  username: 'avery',
  display_name: 'Avery',
  avatar_url: null,
  equipped_border_key: null,
};
jest.mock('../../contexts/ThemeContext', () => ({ useTheme: () => ({ colors: mockColors }) }));
jest.mock('../../hooks/useDojiContributor', () => ({
  useDojiContributor: (id: string) => ({
    data: id
      ? {
          id: 'author',
          username: 'avery',
          display_name: 'Avery',
          avatar_url: null,
          equipped_border_key: null,
        }
      : null,
  }),
}));
test.each([lightColors, darkColors])(
  'credit uses the shared avatar and hides absent authors',
  (colors) => {
    mockColors = colors;
    const view = render(<DojiContributorCredit contributor={author} />);
    expect(view.getByText('Brought to you by')).toBeTruthy();
    expect(view.getByText('@avery')).toBeTruthy();
    expect(view.UNSAFE_getByType(ProfileAvatar).props.profile).toEqual(author);
    view.rerender(<DojiContributorCredit contributor={null} />);
    expect(view.toJSON()).toBeNull();
    view.unmount();
    const connected = render(<ConnectedDojiContributorCredit eventId="event" />);
    expect(connected.getByText('@avery')).toBeTruthy();
    connected.rerender(<ConnectedDojiContributorCredit eventId={undefined} />);
    expect(connected.toJSON()).toBeNull();
  },
);
test.each(['photo', 'task', 'format', 'poll'] as const)(
  'same spotlight for attributed/unattributed %s',
  (challengeType) => {
    const view = render(
      <DojiContributorHero
        contributor={author}
        challengeType={challengeType}
        title="Synthetic prompt"
        description="Description"
        xpReward={50}
      >
        <Text>09:42</Text>
      </DojiContributorHero>,
    );
    expect(view.getByText('@avery')).toBeTruthy();
    expect(view.getByText('50 XP')).toBeTruthy();
    expect(view.queryByText('Today’s Doji')).toBeNull();
    expect(view.getByText('09:42')).toBeTruthy();
    expect(view.UNSAFE_getByType(ProfileAvatar).props.size).toBe(88);
    view.rerender(
      <DojiContributorHero
        contributor={null}
        challengeType={challengeType}
        pollKind="wyr"
        title="Synthetic prompt"
      />,
    );
    expect(view.queryByText('Brought to you by')).toBeNull();
    expect(view.UNSAFE_queryByType(ProfileAvatar)).toBeNull();
    expect(view.UNSAFE_getByType(ChallengeTypeGlyph).props).toEqual(
      expect.objectContaining({ type: challengeType, pollKind: 'wyr' }),
    );
    expect(view.queryByText('50 XP')).toBeNull();
  },
);
