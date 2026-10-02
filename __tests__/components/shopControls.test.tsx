import React from 'react';
import { StyleSheet, View } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import { PurchaseConfirmSheet } from '../../components/economy/PurchaseConfirmSheet';
import { ShopCatalogCard } from '../../components/economy/ShopCatalogCard';
import { ShopItemPreview } from '../../components/economy/ShopItemPreview';
import { SparkPriceTag } from '../../components/economy/SparkPriceTag';
import { Avatar } from '../../components/ui/Avatar';
import { ACCENT_THEME_CATALOG, darkColors, lightColors } from '../../constants/theme';
import { BORDER_CATALOG, TITLE_CATALOG } from '../../lib/cosmetics';
import type { ShopItem } from '../../types/database';

let mockPreference: 'light' | 'dark' = 'light';
const mockPalette = { light: lightColors, dark: darkColors };
jest.mock('../../contexts/ThemeContext', () => ({
  useTheme: () => ({ preference: mockPreference, colors: mockPalette[mockPreference] }),
}));
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light' },
}));
// Only the native sheet boundary is replaced. Shop content, previews, buttons,
// avatars, feedback, icons and prices render their production implementations.
jest.mock('../../components/ui/KeyboardSafeSheet', () => ({
  KeyboardSafeSheet: ({ visible, children }: { visible: boolean; children: React.ReactNode }) =>
    visible ? children : null,
}));

const item = (kind: ShopItem['kind'] = 'theme', overrides: Partial<ShopItem> = {}): ShopItem => ({
  key: 'test_item',
  kind,
  name: 'Test cosmetic',
  price: 1500,
  metadata: {},
  is_active: true,
  sort_order: 1,
  created_at: '2026-10-01',
  ...overrides,
});
const profile = { username: 'tester', display_name: 'Test member', avatar_url: null };
beforeEach(() => {
  jest.clearAllMocks();
  mockPreference = 'light';
});

describe('purchase confirmation', () => {
  const setup = (overrides: Partial<React.ComponentProps<typeof PurchaseConfirmSheet>> = {}) => {
    const props = {
      visible: true,
      item: item(),
      sparksBalance: 2000,
      onConfirm: jest.fn(),
      onClose: jest.fn(),
      ...overrides,
    };
    return { ...render(<PurchaseConfirmSheet {...props} />), props };
  };

  test.each([{ item: null }, { visible: false }])(
    'missing or hidden item does not expose a purchase: %j',
    (overrides) => {
      const view = setup(overrides);
      expect(view.queryByRole('button')).toBeNull();
      expect(view.props.onConfirm).not.toHaveBeenCalled();
    },
  );

  test.each([0, 1499, 1500, 2000])(
    'balance %s only enables an affordable purchase',
    (sparksBalance) => {
      const view = setup({ sparksBalance });
      const button = view.getByRole('button', { name: 'Buy for 1,500 Sparks' });
      if (sparksBalance < 1500) expect(button).toBeDisabled();
      else expect(button).toBeEnabled();
      fireEvent.press(button);
      expect(view.props.onConfirm).toHaveBeenCalledTimes(sparksBalance >= 1500 ? 1 : 0);
      expect(view.props.onClose).not.toHaveBeenCalled();
    },
  );

  test('pending confirmation cannot send a second purchase', () => {
    const view = setup({ loading: true });
    const button = view.getAllByRole('button').find((node) => node.props.accessibilityState.busy);
    expect(button).toBeDefined();
    expect(button!).toBeDisabled();
    fireEvent.press(button!);
    expect(view.props.onConfirm).not.toHaveBeenCalled();
  });

  test('cancel dismisses without purchasing', () => {
    const view = setup();
    fireEvent.press(view.getByRole('button', { name: 'Cancel' }));
    expect(view.props.onClose).toHaveBeenCalledTimes(1);
    expect(view.props.onConfirm).not.toHaveBeenCalled();
  });

  test('failed purchase stays visible and supports a deliberate retry', () => {
    const view = setup({ error: 'Purchase could not be completed.' });
    expect(view.getByRole('alert')).toBeTruthy();
    expect(view.getByText('Purchase could not be completed.')).toBeTruthy();
    expect(view.getByText('Cost')).toBeTruthy();
    expect(view.getByText('1,500')).toBeTruthy();
    fireEvent.press(view.getByRole('button', { name: 'Buy for 1,500 Sparks' }));
    expect(view.props.onConfirm).toHaveBeenCalledTimes(1);
    expect(view.props.onClose).not.toHaveBeenCalled();
  });

  test.each([
    ['theme', 'Accent theme'],
    ['border', 'Avatar frame'],
    ['title', 'Profile title'],
  ] as const)('%s identifies the cosmetic type', (kind, label) => {
    const view = setup({ item: item(kind) });
    expect(view.getByText(label)).toBeTruthy();
  });

  test.each([
    ['title_early_bird', { tagline: 'Ignored override' }, TITLE_CATALOG.title_early_bird.tagline!],
    ['future_title', { tagline: 'New catalogue tagline' }, 'New catalogue tagline'],
  ])('title %s explains the selected cosmetic', (key, metadata, tagline) => {
    const view = setup({ item: item('title', { key: key as string, metadata }), profile });
    expect(view.getByText(tagline as string)).toBeTruthy();
    expect(view.queryByText('Profile title')).toBeNull();
    expect(view.getByText('Test member')).toBeTruthy();
  });
});

describe.each(['light', 'dark'] as const)('%s catalogue', (preference) => {
  test.each([
    [false, false, '1500 Sparks'],
    [true, false, 'owned'],
    [true, true, 'equipped'],
  ] as const)(
    'owned=%s equipped=%s has the correct action and shared palette',
    (owned, equipped, state) => {
      mockPreference = preference;
      const colors = preference === 'light' ? lightColors : darkColors;
      const onPress = jest.fn();
      const view = render(
        <ShopCatalogCard
          item={item()}
          profile={profile}
          owned={owned}
          equipped={equipped}
          onPress={onPress}
        />,
      );
      const card = view.getByRole('button', { name: `Test cosmetic, ${state}` });
      expect(card).toHaveStyle({
        backgroundColor: colors.surfaceElevated,
        borderColor: equipped ? colors.primary : colors.border,
        opacity: owned ? 1 : 0.9,
      });
      expect(view.queryByText('Equipped') !== null).toBe(equipped);
      expect(view.queryByText('Tap to equip') !== null).toBe(owned && !equipped);
      fireEvent.press(card);
      expect(onPress).toHaveBeenCalledTimes(1);
    },
  );
});

describe('cosmetic previews', () => {
  test.each(['compact', 'large'] as const)(
    'border %s uses the registered ring and member avatar',
    (size) => {
      const view = render(
        <ShopItemPreview
          item={item('border', { key: 'border_gold' })}
          profile={profile}
          size={size}
        />,
      );
      expect(view.UNSAFE_getByType(Avatar).props).toMatchObject({
        username: 'tester',
        size: size === 'compact' ? 40 : 72,
        borderColor: BORDER_CATALOG.border_gold.color,
        borderWidth: 3,
      });
      expect(view.getByText('TE')).toBeTruthy();
    },
  );

  test('unrecognized border falls back safely without a member profile', () => {
    const view = render(<ShopItemPreview item={item('border')} />);
    expect(view.UNSAFE_getByType(Avatar).props).toMatchObject({
      size: 72,
      borderColor: '#C0C0C0',
      borderWidth: 3,
    });
    expect(view.getByText('??')).toBeTruthy();
  });

  test.each(['compact', 'large'] as const)(
    'title %s uses the registered label and member identity',
    (size) => {
      const view = render(
        <ShopItemPreview
          item={item('title', { key: 'title_early_bird' })}
          profile={profile}
          size={size}
        />,
      );
      expect(view.getByText(TITLE_CATALOG.title_early_bird.label)).toBeTruthy();
      expect(view.getByText('Test member')).toBeTruthy();
      expect(view.UNSAFE_getByType(Avatar).props.size).toBe(size === 'compact' ? 28 : 40);
    },
  );

  test('new title uses the supplied name and a safe profile placeholder', () => {
    const view = render(<ShopItemPreview item={item('title')} />);
    expect(view.getByText('Test cosmetic')).toBeTruthy();
    expect(view.getByText('You')).toBeTruthy();
  });

  test.each(['compact', 'large'] as const)(
    'theme %s previews the supplied accent without changing preferences',
    (size) => {
      const view = render(
        <ShopItemPreview item={item('theme', { metadata: { color: '#123456' } })} size={size} />,
      );
      const styles = view
        .UNSAFE_getAllByType(View)
        .map((node) => StyleSheet.flatten(node.props.style));
      expect(styles).toEqual(
        expect.arrayContaining([expect.objectContaining({ backgroundColor: '#123456' })]),
      );
      expect(styles).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ width: size === 'compact' ? 88 : '100%', overflow: 'hidden' }),
        ]),
      );
      expect(mockPreference).toBe('light');
      expect(view.queryByRole('button')).toBeNull();
    },
  );

  test.each([
    ['doji_orange', ACCENT_THEME_CATALOG.doji_orange.color],
    ['unknown_theme', '#FF6B35'],
  ])('theme %s falls back to the catalogue or default accent', (key, accent) => {
    mockPreference = 'dark';
    const view = render(<ShopItemPreview item={item('theme', { key })} />);
    const styles = view
      .UNSAFE_getAllByType(View)
      .map((node) => StyleSheet.flatten(node.props.style));
    expect(styles).toEqual(
      expect.arrayContaining([expect.objectContaining({ backgroundColor: accent })]),
    );
    expect(styles).toEqual(
      expect.arrayContaining([expect.objectContaining({ backgroundColor: darkColors.background })]),
    );
  });
});

test.each([0, 500, 1500])('price tag formats %s Sparks without rounding', (price) => {
  const view = render(<SparkPriceTag price={price} />);
  expect(view.getByText(price.toLocaleString())).toHaveStyle({ color: lightColors.text });
});
