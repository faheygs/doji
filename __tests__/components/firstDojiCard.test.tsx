import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FirstDojiCard } from '../../components/feed/FirstDojiCard';
import { ProfileAvatar } from '../../components/ui/ProfileAvatar';
import { IcnFirstPlace } from '../../components/icons/FirstPlaceIcon';
import { CategoryBadgeIcon } from '../../components/icons/BadgeIcons';
import Svg from 'react-native-svg';
import { prepareProfileHref } from '../../lib/profileNavigation';
import type { FirstDoji } from '../../lib/firstDoji';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('../../lib/profileNavigation', () => ({
  prepareProfileHref: jest.fn(() => '/member/test'),
}));
jest.mock('../../contexts/ThemeContext', () => ({
  useTheme: () => ({ colors: require('../../constants/theme').lightColors }),
}));
const winner: FirstDoji = {
  daily_event_id: 'event',
  audience: 'everyone',
  completed_at: '2026-11-10T00:00:00Z',
  profile: {
    id: 'member',
    username: 'first_person',
    display_name: 'First person',
    avatar_url: null,
    equipped_border_key: null,
  },
};

test('renders only the approved short celebration and shared avatar; opens that member', () => {
  const client = new QueryClient();
  const view = render(
    <QueryClientProvider client={client}>
      <FirstDojiCard winner={winner} />
    </QueryClientProvider>,
  );
  expect(view.getByText('Congrats to @first_person!')).toBeTruthy();
  expect(view.getByText('First to Doji today!')).toBeTruthy();
  expect(view.queryByText(/everyone|friends|you’re|sending/i)).toBeNull();
  expect(view.getByRole('button').props.accessibilityLabel).toBe(
    'Congrats to @first_person! First to Doji today!',
  );
  expect(view.UNSAFE_getByType(ProfileAvatar).props.profile).toEqual(winner.profile);
  expect(view.UNSAFE_getByType(IcnFirstPlace).props.size).toBe(20);
  fireEvent.press(view.getByRole('button'));
  expect(prepareProfileHref).toHaveBeenCalledWith('first_person', '/(app)/(tabs)', client);
  expect(mockPush).toHaveBeenCalledWith('/member/test');
  view.unmount();
  client.clear();
});

test.each(['#CD7F32', '#C0C0C0', '#FFD700', '#B9F2FF'])(
  'first-place category uses the dedicated emblem with caller tier color %s',
  (color) => {
    const view = render(<CategoryBadgeIcon categoryId="first_doji" size={40} color={color} />);
    expect(view.UNSAFE_getByType(IcnFirstPlace).props).toMatchObject({ size: 40, color });
    expect(view.UNSAFE_getByType(Svg).props).toMatchObject({ width: 40, height: 40 });
  },
);

test('first-place emblem has a default small icon size', () => {
  const view = render(<IcnFirstPlace color="#FFFFFF" />);
  expect(view.UNSAFE_getByType(Svg).props).toMatchObject({ width: 24, height: 24 });
});
