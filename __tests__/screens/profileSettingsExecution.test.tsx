import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { Switch, TextInput } from 'react-native';
import Toast from 'react-native-toast-message';
import Appearance from '../../app/(app)/profile/appearance';
import EditProfile from '../../app/(app)/profile/edit';
import Shop from '../../app/(app)/profile/shop';
import { ACCENT_THEME_CATALOG, DEFAULT_ACCENT_THEME } from '../../constants/theme';
import { KeyboardToolbarProvider } from '../../contexts/KeyboardToolbarContext';
import { PurchaseConfirmSheet } from '../../components/economy/PurchaseConfirmSheet';
import { ShopCatalogCard } from '../../components/economy/ShopCatalogCard';
import { TITLE_CATALOG } from '../../lib/cosmetics';
import type { Profile, ShopItem, UserShopItem } from '../../types/database';

const mockRouter = {
  push: jest.fn(),
  replace: jest.fn(),
  back: jest.fn(),
  canGoBack: jest.fn(() => true),
};
const mockSetPreference = jest.fn(),
  mockSetAccent = jest.fn(),
  mockUpdate = jest.fn(),
  mockPhoto = jest.fn();
const mockEquip = { mutateAsync: jest.fn(), isPending: false },
  mockPurchase = { mutateAsync: jest.fn(), isPending: false };
let mockProfile: Profile | null;
let mockDark = false,
  mockAccent = DEFAULT_ACCENT_THEME,
  mockUploading = false,
  mockPhotoError = '';
let mockReturn: string | undefined;
let mockAvailability = { status: 'available', isOkForSubmit: true, errorMessage: '' };
type Read<T> = {
  data: T | undefined;
  error: unknown;
  isLoading: boolean;
  isFetching: boolean;
  refetch: jest.Mock;
};
let mockCatalog: Read<ShopItem[]>, mockOwned: Read<UserShopItem[]>;
jest.mock('../../contexts/ThemeContext', () => ({
  useTheme: () => ({
    colors: require('../../constants/theme')[mockDark ? 'darkColors' : 'lightColors'],
    isDark: mockDark,
    accentTheme: mockAccent,
    setPreference: mockSetPreference,
    setAccentTheme: mockSetAccent,
  }),
}));
jest.mock('../../stores/useAuthStore', () => ({
  useAuthStore: (selector: (s: unknown) => unknown) =>
    selector({
      profile: mockProfile,
      session: { user: { id: 'member' } },
      updateProfile: mockUpdate,
    }),
}));
jest.mock('../../hooks/useShop', () => ({
  ...jest.requireActual('../../hooks/useShop'),
  useShopCatalog: () => mockCatalog,
  useOwnedShopItems: () => mockOwned,
  usePurchaseShopItem: () => mockPurchase,
  useEquipShopItem: () => mockEquip,
}));
jest.mock('../../hooks/useSparks', () => ({ useSparksBalance: () => 1000 }));
jest.mock('../../hooks/useUsernameAvailability', () => ({
  ...jest.requireActual('../../hooks/useUsernameAvailability'),
  useUsernameAvailability: () => mockAvailability,
}));
jest.mock('../../hooks/useChangeProfilePhoto', () => ({
  useChangeProfilePhoto: () => ({
    openChangePhotoDialog: mockPhoto,
    uploading: mockUploading,
    error: mockPhotoError,
  }),
}));
jest.mock('../../lib/supabase', () => ({ supabase: {} }));
jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useLocalSearchParams: () => ({ returnTo: mockReturn }),
  usePathname: () => '/profile/appearance',
  useFocusEffect: jest.fn(),
}));
jest.mock(
  'react-native-safe-area-context',
  () => jest.requireActual('react-native-safe-area-context/jest/mock').default,
);
jest.mock('react-native-keyboard-controller', () =>
  require('react-native-keyboard-controller/jest'),
);
jest.mock('react-native-toast-message', () => ({ show: jest.fn() }));
jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(),
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light' },
  NotificationFeedbackType: { Success: 'success' },
}));
const shell = (node: React.ReactNode) => <KeyboardToolbarProvider>{node}</KeyboardToolbarProvider>;
const item = (key: string, kind: ShopItem['kind']): ShopItem => ({
  key,
  kind,
  name: key,
  price: 50,
  sort_order: 0,
  metadata: {},
  is_active: true,
  created_at: '2026-10-01',
});
const owned = (key: string): UserShopItem => ({
  item_key: key,
  user_id: 'member',
  purchased_at: '2026-10-01',
});
const read = <T,>(data: T): Read<T> => ({
  data,
  error: null,
  isLoading: false,
  isFetching: false,
  refetch: jest.fn(),
});
const paid = Object.values(ACCENT_THEME_CATALOG).find((t) => t.key !== DEFAULT_ACCENT_THEME)!;
beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  mockDark = false;
  mockAccent = DEFAULT_ACCENT_THEME;
  mockReturn = undefined;
  mockProfile = {
    id: 'member',
    username: 'synthetic',
    display_name: 'Synthetic',
    bio: 'Bio',
    avatar_url: null,
    level: 1,
  } as Profile;
  mockUploading = false;
  mockPhotoError = '';
  mockAvailability = { status: 'available', isOkForSubmit: true, errorMessage: '' };
  mockCatalog = read([
    item(paid.key, 'theme'),
    item('border_unknown', 'border'),
    item('title_unknown', 'title'),
  ]);
  mockOwned = read([]);
  mockRouter.canGoBack.mockReturnValue(true);
  mockUpdate.mockResolvedValue(undefined);
  mockEquip.mutateAsync.mockResolvedValue(undefined);
  mockPurchase.mutateAsync.mockResolvedValue(undefined);
});
afterEach(() => jest.useRealTimers());

describe.each([false, true])('profile settings dark=%s', (dark) => {
  beforeEach(() => {
    mockDark = dark;
  });
  it('only exposes default and purchased themes, preserving atomic equip ownership', async () => {
    const ui = render(<Appearance />);
    expect(ui.queryByText(paid.name)).toBeNull();
    expect(ui.getByText(/Buy accent themes/)).toBeTruthy();
    fireEvent(ui.UNSAFE_getByType(Switch), 'valueChange', !dark);
    expect(mockSetPreference).toHaveBeenCalledWith(dark ? 'light' : 'dark');
    fireEvent.press(ui.getByText('Default'));
    expect(mockSetAccent).toHaveBeenCalledWith(DEFAULT_ACCENT_THEME);
    mockOwned.data = [owned(paid.key)];
    mockAccent = paid.key;
    ui.rerender(<Appearance />);
    await act(async () => fireEvent.press(ui.getByText(paid.name)));
    expect(mockEquip.mutateAsync).toHaveBeenCalledWith(paid.key);
    expect(mockUpdate).not.toHaveBeenCalled();
    mockEquip.mutateAsync.mockRejectedValueOnce(new Error('offline'));
    await act(async () => fireEvent.press(ui.getByText(paid.name)));
    fireEvent.press(ui.getByText(/Browse more themes/));
    expect(String(mockRouter.push.mock.calls[0][0])).toContain('/profile/shop');
    fireEvent.press(ui.getByLabelText('Back'));
    expect(mockRouter.back).toHaveBeenCalled();
  });
  it('saves normalized profile fields only after successful command', async () => {
    const ui = render(shell(<EditProfile />));
    const fields = ui.UNSAFE_getAllByType(TextInput);
    fireEvent.changeText(fields[0], ' @New_Name ');
    fireEvent.changeText(fields[1], ' New Name ');
    fireEvent.changeText(fields[2], ' New bio ');
    await act(async () => fireEvent.press(ui.getByText('Save changes')));
    expect(mockUpdate).toHaveBeenCalledWith({
      username: 'new_name',
      display_name: 'New Name',
      bio: 'New bio',
    });
    expect(Toast.show).toHaveBeenCalledWith({ type: 'success', text1: 'Profile updated' });
    expect(mockRouter.back).toHaveBeenCalled();
  });
  it('keeps failed saves in place and permits retry after edits', async () => {
    mockUpdate.mockRejectedValueOnce(new Error('failed'));
    const ui = render(shell(<EditProfile />));
    await act(async () => fireEvent.press(ui.getByText('Save changes')));
    expect(ui.getByTestId('edit-profile-error')).toBeTruthy();
    expect(mockRouter.back).not.toHaveBeenCalled();
    const fields = ui.UNSAFE_getAllByType(TextInput);
    fireEvent.changeText(fields[1], ' ');
    fireEvent.changeText(fields[2], ' ');
    expect(ui.queryByTestId('edit-profile-error')).toBeNull();
    await act(async () => fireEvent.press(ui.getByText('Save changes')));
    expect(mockUpdate).toHaveBeenLastCalledWith({
      username: 'synthetic',
      display_name: 'synthetic',
      bio: null,
    });
  });
  it('opens photo control, displays its failure and prevents duplicate photo requests', () => {
    const ui = render(shell(<EditProfile />));
    fireEvent.press(ui.getByLabelText('Change profile photo'));
    expect(mockPhoto).toHaveBeenCalledTimes(1);
    mockUploading = true;
    mockPhotoError = 'Upload failed';
    ui.rerender(shell(<EditProfile />));
    fireEvent.press(ui.getByLabelText('Change profile photo'));
    expect(mockPhoto).toHaveBeenCalledTimes(1);
    expect(ui.getByText('Upload failed')).toBeTruthy();
    fireEvent.press(ui.getByLabelText('Back'));
    expect(mockRouter.back).toHaveBeenCalled();
  });
  it('purchases only after confirmation and closes on successful atomic purchase', async () => {
    const ui = render(shell(<Shop />));
    fireEvent.press(ui.UNSAFE_getAllByType(ShopCatalogCard)[0]);
    expect(mockPurchase.mutateAsync).not.toHaveBeenCalled();
    expect(ui.UNSAFE_getByType(PurchaseConfirmSheet).props.visible).toBe(true);
    await act(async () => ui.UNSAFE_getByType(PurchaseConfirmSheet).props.onConfirm());
    expect(mockPurchase.mutateAsync).toHaveBeenCalledWith(paid.key);
    expect(ui.UNSAFE_getByType(PurchaseConfirmSheet).props.visible).toBe(false);
    fireEvent.press(ui.getByLabelText('Back'));
    expect(mockRouter.back).toHaveBeenCalled();
  });
  it('retains confirmation on failed purchase and supports dismissal', async () => {
    mockPurchase.mutateAsync.mockRejectedValueOnce(new Error('balance'));
    const ui = render(shell(<Shop />));
    fireEvent.press(ui.UNSAFE_getAllByType(ShopCatalogCard)[1]);
    await act(async () => ui.UNSAFE_getByType(PurchaseConfirmSheet).props.onConfirm());
    expect(ui.getByText(/Could not complete this purchase/)).toBeTruthy();
    act(() => ui.UNSAFE_getByType(PurchaseConfirmSheet).props.onClose());
    expect(ui.UNSAFE_getByType(PurchaseConfirmSheet).props.visible).toBe(false);
    await act(async () => ui.UNSAFE_getByType(PurchaseConfirmSheet).props.onConfirm());
    expect(mockPurchase.mutateAsync).toHaveBeenCalledTimes(1);
  });
  it('equips owned items without purchasing and surfaces errors', async () => {
    mockOwned.data = mockCatalog.data!.map((x) => owned(x.key));
    mockProfile!.equipped_title_key = 'title_unknown';
    mockProfile!.equipped_border_key = 'border_unknown';
    mockAccent = paid.key;
    mockEquip.mutateAsync.mockRejectedValueOnce(new Error('offline'));
    const ui = render(shell(<Shop />));
    await act(async () => fireEvent.press(ui.UNSAFE_getAllByType(ShopCatalogCard)[0]));
    expect(ui.getByText('Could not equip that item. Try again.')).toBeTruthy();
    await act(async () => fireEvent.press(ui.getByText('title_unknown')));
    expect(mockEquip.mutateAsync).toHaveBeenLastCalledWith('title_unknown');
    expect(mockPurchase.mutateAsync).not.toHaveBeenCalled();
  });
});
it.each(['checking', 'invalid', 'taken', 'error'])(
  'disables invalid username status %s',
  (status) => {
    mockAvailability = { status, isOkForSubmit: false, errorMessage: 'Unavailable username' };
    const ui = render(shell(<EditProfile />));
    fireEvent.press(ui.getByText('Save changes'));
    expect(mockUpdate).not.toHaveBeenCalled();
    if (status !== 'checking') expect(ui.getByText('Unavailable username')).toBeTruthy();
  },
);
it('handles missing profile and optional profile fields, caps bio length and reacts to refreshed fields', () => {
  mockProfile = null;
  const ui = render(shell(<EditProfile />));
  expect(ui.queryByText('Edit profile')).toBeNull();
  mockProfile = { id: 'member', username: '', display_name: '', bio: null } as Profile;
  ui.rerender(shell(<EditProfile />));
  fireEvent.press(ui.getByText('Save changes'));
  expect(mockUpdate).not.toHaveBeenCalled();
  fireEvent.changeText(ui.UNSAFE_getAllByType(TextInput)[2], 'x'.repeat(200));
  expect(ui.getByDisplayValue('x'.repeat(150))).toBeTruthy();
  mockProfile = { ...mockProfile, username: 'fresh', bio: 'changed' };
  ui.rerender(shell(<EditProfile />));
  expect(ui.getByDisplayValue('changed')).toBeTruthy();
});
it('uses cold-route fallback rather than requiring navigation history', () => {
  mockRouter.canGoBack.mockReturnValue(false);
  const ui = render(<Appearance />);
  fireEvent.press(ui.getByLabelText('Back'));
  expect(String(mockRouter.replace.mock.calls[0][0])).toContain('/profile');
});
it.each(['catalog', 'owned', 'both'])('retries only failed %s shop reads', (source) => {
  const err = Object.assign(new Error('denied'), { status: 403 });
  if (source !== 'owned') mockCatalog.error = err;
  if (source !== 'catalog') mockOwned.error = err;
  const ui = render(shell(<Shop />));
  expect(ui.queryByText('Make Doji yours')).toBeNull();
  fireEvent.press(ui.getByText('Try again'));
  expect(mockCatalog.refetch).toHaveBeenCalledTimes(source === 'owned' ? 0 : 1);
  expect(mockOwned.refetch).toHaveBeenCalledTimes(source === 'catalog' ? 0 : 1);
});
it('preserves previous shop data during transient refresh errors', () => {
  mockCatalog.error = Object.assign(new Error('timeout'), { status: 504 });
  const ui = render(shell(<Shop />));
  expect(ui.getByText('Make Doji yours')).toBeTruthy();
  expect(ui.getByText(/Previously loaded/)).toBeTruthy();
});
it('shows initial skeleton and no purchasable items without loaded ownership', () => {
  mockOwned.data = undefined;
  mockOwned.isLoading = true;
  mockCatalog.data = undefined;
  const ui = render(shell(<Shop />));
  expect(ui.queryByText('Make Doji yours')).toBeNull();
});
it('renders canonical and metadata title labels with owned and unowned actions', async () => {
  const key = Object.keys(TITLE_CATALOG)[0];
  mockCatalog.data = [
    item(key, 'title'),
    { ...item('custom', 'title'), metadata: { tagline: 'Custom tagline' } },
  ];
  mockOwned.data = [owned(key)];
  const ui = render(shell(<Shop />));
  expect(ui.getByText('Owned')).toBeTruthy();
  expect(ui.getByText('Custom tagline')).toBeTruthy();
  await act(async () => fireEvent.press(ui.getByText(TITLE_CATALOG[key].label)));
  expect(mockEquip.mutateAsync).toHaveBeenCalledWith(key);
  fireEvent.press(ui.getByText('custom'));
  expect(ui.UNSAFE_getByType(PurchaseConfirmSheet).props.item.key).toBe('custom');
});
