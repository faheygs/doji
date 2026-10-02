import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { NotificationSheet } from '../../components/notifications/NotificationSheet';
import FriendsScreen from '../../app/(app)/(tabs)/friends';
import ShopScreen from '../../app/(app)/profile/shop';

const mockRefetch = jest.fn();
const mockNext = jest.fn();
let mockFriends: any;
let mockOwned: any;
const mockPurchase = jest.fn();
const mockEquip = jest.fn();
jest.mock('../../hooks/useSparks', () => ({ useSparksBalance: () => 500 }));
jest.mock('../../hooks/useShop', () => ({
  useShopCatalog: () => ({ data: [{ key: 'ocean', name: 'Ocean theme', kind: 'theme', price: 100 }], isLoading: false }),
  useOwnedShopItems: () => mockOwned,
  usePurchaseShopItem: () => ({ mutateAsync: mockPurchase }),
  useEquipShopItem: () => ({ mutateAsync: mockEquip }),
  isShopItemOwned: (owned: any[], key: string) => owned.some(item => item.key === key),
}));
jest.mock('../../components/economy/ShopCatalogCard', () => ({ ShopCatalogCard: ({ item, onPress }: any) => {
  const { Text } = require('react-native'); return <Text onPress={onPress}>{item.name}</Text>;
} }));
jest.mock('../../components/economy/PurchaseConfirmSheet', () => ({ PurchaseConfirmSheet: ({ visible, onConfirm }: any) => {
  const { Text } = require('react-native'); return visible ? <Text onPress={onConfirm}>Confirm purchase</Text> : null;
} }));
jest.mock('../../components/economy/SparksPill', () => ({ LiveSparksPill: () => null }));
jest.mock('react-native-gesture-handler', () => ({
  GestureHandlerRootView: ({ children }: any) => children,
  Swipeable: ({ children }: any) => children,
}));
jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, left: 0, right: 0, bottom: 0 }),
}));
jest.mock('../../contexts/ThemeContext', () => ({ useTheme: () => ({ colors: {
  error: '#ff0000', link: '#0000ff', text: '#ffffff', textSecondary: '#aaaaaa', textTertiary: '#888888',
  border: '#888888', primary: '#00ff00', onPrimary: '#000000', surface: '#111111', background: '#000000',
} }) }));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }), useFocusEffect: jest.fn(), useLocalSearchParams: () => ({}) }));
jest.mock('../../contexts/DialogContext', () => ({ useAppDialog: () => ({ showDialog: jest.fn() }) }));
jest.mock('../../contexts/NavigationOriginContext', () => ({ useNavigationOrigin: () => '/(app)/(tabs)' }));
jest.mock('../../hooks/useDismissOnRouteBlur', () => ({ useDismissOnRouteBlur: jest.fn() }));
jest.mock('../../hooks/useUsernameAvailability', () => ({ normalizeUsernameInput: (value: string) => value }));
jest.mock('../../lib/commandGateway', () => ({ executeCommand: jest.fn() }));
jest.mock('../../lib/profileNavigation', () => ({ prepareProfileHref: jest.fn() }));
jest.mock('../../hooks/useFriendsPaged', () => ({ useFriendsPaged: () => mockFriends }));
jest.mock('../../hooks/useProfile', () => ({ useFriendCount: () => ({ data: 0 }), useRemoveFriend: () => ({ mutate: jest.fn() }) }));
jest.mock('../../hooks/useFriendRequests', () => ({ useFriendRequestCount: () => ({ data: 0 }), useRespondToFriendRequest: () => ({ mutate: jest.fn() }) }));
jest.mock('../../stores/useAuthStore', () => ({ useAuthStore: (select: any) => select({ session: { user: { id: 'member' } } }) }));
jest.mock('../../components/ui/SkeletonSwap', () => ({ SkeletonSwap: ({ children }: any) => children }));
jest.mock('../../components/ui/Avatar', () => ({ Avatar: () => null }));

beforeEach(() => {
  jest.clearAllMocks();
  mockFriends = { data: undefined, error: { status: 504 }, isError: true, isLoading: false,
    isFetching: false, isFetchingNextPage: false, hasNextPage: false, refetch: mockRefetch, fetchNextPage: mockNext };
  mockOwned = { data: undefined, error: { status: 504 }, isLoading: false, isFetching: false, refetch: mockRefetch };
});

test('notification cold failure cannot claim all caught up and exposes a retry', () => {
  const retry = jest.fn();
  const view = render(<NotificationSheet visible items={[]} isLoading={false} onClose={jest.fn()}
    readError={{ status: 504 }} onRetryRead={retry} />);
  expect(view.queryByText("You're all caught up")).toBeNull();
  expect(view.getByText('Could not load notifications. Please try again.')).toBeTruthy();
  fireEvent.press(view.getByLabelText('Try loading again')); expect(retry).toHaveBeenCalledTimes(1);
  view.rerender(<NotificationSheet visible items={[]} isLoading={false} onClose={jest.fn()} />);
  expect(view.getByText("You're all caught up")).toBeTruthy();
});

test('friends failure is not no-friends state; manual retry does not cancel an active request', () => {
  const view = render(<FriendsScreen />);
  expect(view.queryByText('No friends yet')).toBeNull();
  expect(view.getByText('Could not load friends. Please try again.')).toBeTruthy();
  fireEvent.press(view.getByLabelText('Try loading again'));
  expect(mockRefetch).toHaveBeenCalledWith({ cancelRefetch: false });
  mockFriends = { ...mockFriends, error: null, isError: false, data: { pages: [[]] } };
  view.rerender(<FriendsScreen />); expect(view.getByText('No friends yet')).toBeTruthy();
});

test('failed friends pagination retries the same next page instead of triggering a scroll retry loop', () => {
  mockFriends = { ...mockFriends, isFetchNextPageError: true, hasNextPage: true };
  const view = render(<FriendsScreen />);
  fireEvent.press(view.getByLabelText('Try loading again'));
  expect(mockNext).toHaveBeenCalledWith({ cancelRefetch: false }); expect(mockRefetch).not.toHaveBeenCalled();
});

test('failed ownership read cannot misrepresent all items as unowned or open a purchase', () => {
  const view = render(<ShopScreen />);
  expect(view.getByText('Could not load the shop and your owned items. Please try again.')).toBeTruthy();
  expect(view.queryByText('Ocean theme')).toBeNull(); expect(view.queryByText('Confirm purchase')).toBeNull();
  fireEvent.press(view.getByLabelText('Try loading again'));
  expect(mockRefetch).toHaveBeenCalledWith({ cancelRefetch: false });
  expect(mockPurchase).not.toHaveBeenCalled(); expect(mockEquip).not.toHaveBeenCalled();
  mockOwned = { ...mockOwned, data: [], error: null };
  view.rerender(<ShopScreen />); expect(view.getByText('Ocean theme')).toBeTruthy();
});

test('temporary ownership refresh preserves catalog, but access loss closes purchase intent', () => {
  mockOwned = { ...mockOwned, data: [], error: { status: 504 } };
  const view = render(<ShopScreen />);
  expect(view.getByText('Ocean theme')).toBeTruthy();
  fireEvent.press(view.getByText('Ocean theme')); expect(view.getByText('Confirm purchase')).toBeTruthy();
  mockOwned = { ...mockOwned, error: { status: 403 } };
  view.rerender(<ShopScreen />);
  expect(view.queryByText('Ocean theme')).toBeNull(); expect(view.queryByText('Confirm purchase')).toBeNull();
  expect(mockPurchase).not.toHaveBeenCalled();
});
