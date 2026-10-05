import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { ActivityIndicator, Modal, View } from 'react-native';
import { Image } from 'expo-image';
import { lightColors, darkColors } from '../../constants/theme';
import { KeyboardToolbarProvider } from '../../contexts/KeyboardToolbarContext';
import { SparkPriceTag } from '../../components/economy/SparkPriceTag';
import { SparksPill, LiveSparksPill } from '../../components/economy/SparksPill';
import { ShopCatalogCard } from '../../components/economy/ShopCatalogCard';
import { ShopItemPreview } from '../../components/economy/ShopItemPreview';
import { PurchaseConfirmSheet } from '../../components/economy/PurchaseConfirmSheet';
import { BuyInSheet } from '../../components/economy/BuyInSheet';
import { Avatar } from '../../components/ui/Avatar';
import { ProfileAvatar } from '../../components/ui/ProfileAvatar';
import { AvatarStack } from '../../components/ui/AvatarStack';
import { BORDER_CATALOG, TITLE_CATALOG } from '../../lib/cosmetics';
import { SPARKS_BUY_IN_COST } from '../../constants/sparks';
import type { ShopItem, Challenge, UserEvent } from '../../types/database';

let mockColors = lightColors;
let mockPreference = 'light';
let mockBalance = 100;
jest.mock('../../contexts/ThemeContext', () => ({
  useTheme: () => ({ colors: mockColors, preference: mockPreference }),
}));
jest.mock('../../hooks/useSparks', () => ({ useSparksBalance: () => mockBalance }));
jest.mock(
  'react-native-safe-area-context',
  () => jest.requireActual('react-native-safe-area-context/jest/mock').default,
);
jest.mock('react-native-keyboard-controller', () =>
  require('react-native-keyboard-controller/jest'),
);
jest.mock('expo-router', () => ({ useFocusEffect: jest.fn() }));
jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(),
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light' },
}));
const person = { username: 'synthetic', display_name: 'Synthetic Member', avatar_url: null };
const item = (kind: ShopItem['kind'] = 'theme', key = 'synthetic'): ShopItem => ({
  key,
  kind,
  name: 'Synthetic item',
  price: 500,
  sort_order: 0,
  metadata: {},
  is_active: true,
  created_at: '2026-10-02T00:00:00Z',
});
const shell = (children: React.ReactNode) => (
  <KeyboardToolbarProvider>{children}</KeyboardToolbarProvider>
);
beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  mockColors = lightColors;
  mockPreference = 'light';
  mockBalance = 100;
});
afterEach(() => jest.useRealTimers());

describe.each(['light', 'dark'])('%s economy presentation', (mode) => {
  beforeEach(() => {
    mockColors = mode === 'light' ? lightColors : darkColors;
    mockPreference = mode;
  });
  test('prices are formatted from actual amount', () => {
    const v = render(<SparkPriceTag price={1500} />);
    expect(v.getByText('1,500')).toBeTruthy();
  });
  test.each([true, false])(
    'balance pill compact=%s supports press and gain lifecycle',
    (compact) => {
      const press = jest.fn();
      const v = render(<SparksPill amount={1000} onPress={press} compact={compact} trackGain />);
      fireEvent.press(v.getByRole('button'));
      expect(press).toHaveBeenCalledTimes(1);
      v.rerender(<SparksPill amount={1050} onPress={press} compact={compact} trackGain />);
      expect(v.getByText('+50')).toBeTruthy();
      expect(v.getByText('1,050')).toBeTruthy();
      act(() => jest.advanceTimersByTime(800));
      expect(v.queryByText('+50')).toBeNull();
    },
  );
  test('static price pill has no navigation or earn animation', () => {
    const v = render(<SparksPill amount={10} />);
    v.rerender(<SparksPill amount={50} />);
    expect(v.queryByRole('button')).toBeNull();
    expect(v.queryByText('+40')).toBeNull();
  });
  test('live pill follows signed-in balance', () => {
    const v = render(<LiveSparksPill />);
    expect(v.getByText('100')).toBeTruthy();
    mockBalance = 120;
    v.rerender(<LiveSparksPill />);
    expect(v.getByText('+20')).toBeTruthy();
  });
  test.each(['sale', 'owned', 'equipped'])('catalog card exposes %s state', (state) => {
    const press = jest.fn();
    const v = render(
      <ShopCatalogCard
        item={item()}
        profile={person}
        owned={state === 'owned'}
        equipped={state === 'equipped'}
        onPress={press}
      />,
    );
    fireEvent.press(
      v.getByRole('button', { name: `Synthetic item, ${state === 'sale' ? '500 Sparks' : state}` }),
    );
    expect(press).toHaveBeenCalledTimes(1);
    if (state === 'owned') expect(v.getByText('Tap to equip')).toBeTruthy();
    if (state === 'equipped') expect(v.getByText('Equipped')).toBeTruthy();
  });
  test.each(['compact', 'large'] as const)(
    'theme preview %s uses metadata accent without mutating app theme',
    (size) => {
      const v = render(
        <ShopItemPreview item={{ ...item(), metadata: { color: '#123456' } }} size={size} />,
      );
      const nodes = v.UNSAFE_getAllByType(View);
      expect(nodes.some((node) => JSON.stringify(node.props.style).includes('#123456'))).toBe(true);
      expect(mockColors.primary).not.toBe('#123456');
    },
  );
  test.each(['border_gold', 'unknown'])(
    'border %s preview uses catalog or fallback frame',
    (key) => {
      const v = render(
        <ShopItemPreview item={item('border', key)} profile={person} size="compact" />,
      );
      expect(v.UNSAFE_getByType(Avatar).props).toMatchObject({
        size: 40,
        borderColor: BORDER_CATALOG[key]?.color ?? '#C0C0C0',
        borderWidth: 3,
      });
      v.rerender(<ShopItemPreview item={item('border', key)} size="large" />);
      expect(v.UNSAFE_getByType(Avatar).props.size).toBe(72);
      expect(v.getByText('??')).toBeTruthy();
    },
  );
  test.each(['title_early_bird', 'unknown'])(
    'title %s preview presents actual member identity and name fallback',
    (key) => {
      const v = render(
        <ShopItemPreview item={item('title', key)} profile={person} size="compact" />,
      );
      expect(v.getByText('Synthetic Member')).toBeTruthy();
      expect(v.getByText(TITLE_CATALOG[key]?.label ?? 'Synthetic item')).toBeTruthy();
      v.rerender(<ShopItemPreview item={item('title', key)} />);
      expect(v.getByText('You')).toBeTruthy();
      expect(v.UNSAFE_getByType(Avatar).props.size).toBe(40);
    },
  );
});

describe('purchase confirmation and buy-in controls', () => {
  test('no selected item renders no purchase window', () => {
    const v = render(
      shell(
        <PurchaseConfirmSheet
          visible
          item={null}
          sparksBalance={500}
          onConfirm={jest.fn()}
          onClose={jest.fn()}
        />,
      ),
    );
    expect(v.toJSON()).toBeNull();
  });
  test.each([
    ['theme', 'Accent theme'],
    ['border', 'Avatar frame'],
    ['title', 'Profile title'],
  ] as const)('purchase %s explains kind and requires explicit confirmation', (kind, label) => {
    const confirm = jest.fn(),
      close = jest.fn();
    const v = render(
      shell(
        <PurchaseConfirmSheet
          visible
          item={item(kind)}
          sparksBalance={500}
          onConfirm={confirm}
          onClose={close}
        />,
      ),
    );
    expect(v.getByText(label)).toBeTruthy();
    fireEvent.press(v.getByRole('button', { name: 'Buy for 500 Sparks' }));
    expect(confirm).toHaveBeenCalledTimes(1);
    fireEvent.press(v.getByRole('button', { name: 'Cancel' }));
    expect(close).toHaveBeenCalledTimes(1);
  });
  test.each(['catalog', 'metadata'])('title purchase shows %s tagline', (source) => {
    const selected =
      source === 'catalog'
        ? item('title', 'title_early_bird')
        : { ...item('title'), metadata: { tagline: 'Synthetic tagline' } };
    const v = render(
      shell(
        <PurchaseConfirmSheet
          visible
          item={selected}
          sparksBalance={500}
          onConfirm={jest.fn()}
          onClose={jest.fn()}
        />,
      ),
    );
    expect(
      v.getByText(source === 'catalog' ? 'Zero chill. Maximum plot.' : 'Synthetic tagline'),
    ).toBeTruthy();
  });
  test.each(['insufficient', 'pending'])('purchase %s cannot invoke write', (state) => {
    const confirm = jest.fn();
    const v = render(
      shell(
        <PurchaseConfirmSheet
          visible
          item={item()}
          sparksBalance={state === 'insufficient' ? 499 : 500}
          loading={state === 'pending'}
          error="Synthetic failure"
          onConfirm={confirm}
          onClose={jest.fn()}
        />,
      ),
    );
    expect(v.getByText('Synthetic failure')).toBeTruthy();
    if (state === 'insufficient') {
      const b = v.getByRole('button', { name: 'Buy for 500 Sparks' });
      expect(b).toBeDisabled();
      fireEvent.press(b);
    } else expect(v.UNSAFE_getByType(ActivityIndicator)).toBeTruthy();
    expect(confirm).not.toHaveBeenCalled();
  });
  test('closing a purchase unmounts native window', () => {
    const props = { item: item(), sparksBalance: 500, onConfirm: jest.fn(), onClose: jest.fn() };
    const v = render(shell(<PurchaseConfirmSheet {...props} visible />));
    expect(v.UNSAFE_getByType(Modal)).toBeTruthy();
    v.rerender(shell(<PurchaseConfirmSheet {...props} visible={false} />));
    expect(v.UNSAFE_queryAllByType(Modal)).toHaveLength(0);
  });
  test.each(['challenge', 'user-event', 'fallback'])('buy-in title resolves from %s', (source) => {
    const challenge = { title: 'Synthetic Doji', type: 'photo' } as Challenge;
    const confirm = jest.fn(),
      close = jest.fn();
    const v = render(
      shell(
        <BuyInSheet
          visible
          challenge={source === 'challenge' ? challenge : null}
          userEvent={source === 'user-event' ? ({ challenge } as UserEvent) : null}
          sparksBalance={SPARKS_BUY_IN_COST + 100}
          onConfirm={confirm}
          onClose={close}
        />,
      ),
    );
    expect(
      v.getByText(source === 'fallback' ? "Today's challenge" : 'Synthetic Doji'),
    ).toBeTruthy();
    fireEvent.press(v.getByRole('button', { name: `Buy in for ${SPARKS_BUY_IN_COST} Sparks` }));
    expect(confirm).toHaveBeenCalledTimes(1);
    fireEvent.press(v.getByRole('button', { name: 'Cancel' }));
    expect(close).toHaveBeenCalledTimes(1);
    expect(v.getByText('100')).toBeTruthy();
  });
  test('insufficient buy-in displays zero resulting balance and retry feedback', () => {
    const confirm = jest.fn();
    const v = render(
      shell(
        <BuyInSheet
          visible
          challenge={null}
          userEvent={null}
          sparksBalance={0}
          error="Synthetic denial"
          onConfirm={confirm}
          onClose={jest.fn()}
        />,
      ),
    );
    expect(v.getByText('Buy-in did not complete')).toBeTruthy();
    expect(v.getByText('Synthetic denial')).toBeTruthy();
    const b = v.getByRole('button', { name: `Buy in for ${SPARKS_BUY_IN_COST} Sparks` });
    expect(b).toBeDisabled();
    fireEvent.press(b);
    expect(confirm).not.toHaveBeenCalled();
  });
});

describe('canonical avatar rendering', () => {
  test.each(['default', 'brand'] as const)(
    '%s fallback handles missing and known identities',
    (fallbackTone) => {
      const v = render(<Avatar fallbackTone={fallbackTone} />);
      expect(v.getByText('??')).toHaveStyle({
        color: fallbackTone === 'brand' ? lightColors.accent : lightColors.textSecondary,
      });
      v.rerender(<Avatar username="synthetic" fallbackTone={fallbackTone} size={60} />);
      expect(v.getByText('SY')).toHaveStyle({
        fontSize: fallbackTone === 'brand' ? 60 * 0.36 : 60 * 0.32,
      });
    },
  );
  test('image source is recycled by exact URI', () => {
    const v = render(<Avatar uri="https://synthetic.invalid/avatar.png" />);
    expect(v.UNSAFE_getByType(Image).props).toMatchObject({
      source: { uri: 'https://synthetic.invalid/avatar.png' },
      recyclingKey: 'https://synthetic.invalid/avatar.png',
      contentFit: 'cover',
      cachePolicy: 'memory-disk',
    });
  });
  test.each([
    { rankBorderColor: '#112233' },
    { rankBorderColor: '#112233', borderColor: '#445566', borderWidth: 4 },
    { borderColor: '#445566' },
  ])('cosmetic frame wins over rank while preserving wrapper layout %j', (props) => {
    const v = render(<Avatar {...props} style={{ margin: 5 }} size={40} />);
    const root = v.UNSAFE_getAllByType(View)[0];
    expect(root.props.style).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ borderColor: props.borderColor ?? props.rankBorderColor }),
        { margin: 5 },
      ]),
    );
  });
  test.each([
    null,
    person,
    { ...person, display_name: '' },
    { ...person, equipped_border_key: 'border_gold' },
  ])('profile avatar follows canonical identity/frame %j', (profile) => {
    const v = render(<ProfileAvatar profile={profile} />);
    expect(v.UNSAFE_getByType(Avatar).props.username).toBe(
      profile?.display_name ?? profile?.username ?? undefined,
    );
    if (profile && 'equipped_border_key' in profile)
      expect(v.UNSAFE_getByType(Avatar).props.borderColor).toBe('#FFD700');
  });
  test('avatar stack caps count and tolerates missing metadata', () => {
    const v = render(
      <AvatarStack
        users={[
          { username: 'one', equipped_border_key: 'border_gold' },
          { username: null },
          {},
          { username: 'excluded' },
        ]}
        borderColor="#000"
      />,
    );
    expect(v.UNSAFE_getAllByType(Avatar)).toHaveLength(3);
    expect(v.queryByText('EX')).toBeNull();
    expect(v.getAllByText('?')).toHaveLength(2);
    v.rerender(<AvatarStack users={[]} borderColor="#fff" size={24} max={2} />);
    expect(v.UNSAFE_queryAllByType(Avatar)).toHaveLength(0);
  });
});
