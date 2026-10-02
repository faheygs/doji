import React from 'react';
import { ActivityIndicator, Text, TouchableOpacity } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import * as Haptics from 'expo-haptics';
import { Button } from '../../components/ui/Button';
import { darkColors, lightColors } from '../../constants/theme';

let mockColors = lightColors;
jest.mock('../../contexts/ThemeContext', () => ({ useTheme: () => ({ colors: mockColors }) }));
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light' },
}));
beforeEach(() => {
  jest.clearAllMocks();
  mockColors = lightColors;
});

test('an enabled press invokes the actual callback once with light feedback', () => {
  const onPress = jest.fn();
  const view = render(<Button onPress={onPress}>Continue</Button>);
  fireEvent.press(view.getByRole('button', { name: 'Continue' }));
  expect(onPress).toHaveBeenCalledTimes(1);
  expect(Haptics.impactAsync).toHaveBeenCalledWith(Haptics.ImpactFeedbackStyle.Light);
});

test.each([{ disabled: true }, { loading: true }, { disabled: true, loading: true }])(
  'pending/disabled actions are inert: %j',
  (props) => {
    const onPress = jest.fn();
    const view = render(
      <Button {...props} accessibilityLabel="Save" onPress={onPress}>
        Save
      </Button>,
    );
    const button = view.getByRole('button', { name: 'Save' });
    expect(button).toBeDisabled();
    expect(button.props.accessibilityState.busy).toBe(props.loading === true);
    fireEvent.press(button);
    // Also exercise the handler's defensive guard, not just RN's disabled prop.
    view.UNSAFE_getByType(TouchableOpacity).props.onPress();
    expect(onPress).not.toHaveBeenCalled();
    expect(Haptics.impactAsync).not.toHaveBeenCalled();
  },
);

describe.each([
  ['light', lightColors],
  ['dark', darkColors],
] as const)('%s theme', (_name, colors) => {
  test.each(['primary', 'secondary', 'ghost', 'danger'] as const)(
    '%s uses the shared palette for label and loading indicator',
    (variant) => {
      mockColors = colors;
      const view = render(
        <Button variant={variant} onPress={jest.fn()} leftIcon={<Text>Icon</Text>}>
          Action
        </Button>,
      );
      const labelColor =
        variant === 'primary'
          ? colors.onPrimary
          : variant === 'danger'
            ? colors.error
            : variant === 'ghost'
              ? colors.link
              : colors.text;
      expect(view.getByText('Action')).toHaveStyle({ color: labelColor });
      expect(view.getByRole('button')).toHaveStyle({
        backgroundColor: variant === 'primary' ? colors.primary : 'transparent',
      });
      if (variant === 'danger' || variant === 'secondary')
        expect(view.getByRole('button')).toHaveStyle({
          borderColor: variant === 'danger' ? colors.error : colors.border,
        });
      expect(view.getByText('Icon')).toBeTruthy();
      view.rerender(
        <Button variant={variant} onPress={jest.fn()} loading leftIcon={<Text>Icon</Text>}>
          Action
        </Button>,
      );
      expect(view.queryByText('Action')).toBeNull();
      expect(view.queryByText('Icon')).toBeNull();
      expect(view.UNSAFE_getByType(ActivityIndicator).props.color).toBe(
        variant === 'primary'
          ? colors.onPrimary
          : variant === 'danger'
            ? colors.error
            : colors.text,
      );
    },
  );
});

test.each([
  ['sm', 36],
  ['md', 48],
  ['lg', 52],
] as const)('%s respects minimum control size and explicit layout overrides', (size, minHeight) => {
  const view = render(
    <Button size={size} fullWidth style={{ marginTop: 7 }} onPress={jest.fn()}>
      Action
    </Button>,
  );
  expect(view.getByRole('button')).toHaveStyle({ minHeight, width: '100%', marginTop: 7 });
});
