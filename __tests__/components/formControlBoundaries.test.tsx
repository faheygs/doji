import React from 'react';
import { AccessibilityInfo, Keyboard, StyleSheet, type ViewStyle } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import { SearchField } from '../../components/ui/SearchField';
import { Input } from '../../components/ui/Input';
import { AppTextInput } from '../../components/ui/AppTextInput';
import { InlineFeedback } from '../../components/ui/InlineFeedback';
import { darkColors, lightColors } from '../../constants/theme';

let mockColors = lightColors;
let mockIsDark = false;
jest.mock('../../contexts/ThemeContext', () => ({
  useTheme: () => ({ colors: mockColors, isDark: mockIsDark }),
}));
beforeEach(() => {
  jest.clearAllMocks();
  mockColors = lightColors;
  mockIsDark = false;
});
afterEach(() => jest.restoreAllMocks());

test.each([false, true])(
  'native field defaults follow the theme (dark=%s) and explicit caller props win',
  (isDark) => {
    mockIsDark = isDark;
    mockColors = isDark ? darkColors : lightColors;
    const view = render(<AppTextInput testID="field" />);
    expect(view.getByTestId('field').props).toMatchObject({
      keyboardAppearance: isDark ? 'dark' : 'light',
      placeholderTextColor: mockColors.textTertiary,
      selectionColor: mockColors.link,
    });
    view.rerender(
      <AppTextInput
        testID="field"
        placeholderTextColor="#123"
        selectionColor="#456"
        keyboardAppearance="default"
      />,
    );
    expect(view.getByTestId('field').props).toMatchObject({
      keyboardAppearance: 'default',
      placeholderTextColor: '#123',
      selectionColor: '#456',
    });
  },
);

test('search defaults do not summon the keyboard; typing and clearing use the caller callback', () => {
  const onChangeText = jest.fn();
  const view = render(<SearchField value="" onChangeText={onChangeText} />);
  expect(view.getByLabelText('Search').props.autoFocus).toBe(false);
  expect(view.queryByRole('button', { name: 'Clear search' })).toBeNull();
  fireEvent.changeText(view.getByLabelText('Search'), 'person');
  expect(onChangeText).toHaveBeenLastCalledWith('person');
  view.rerender(
    <SearchField
      value="person"
      onChangeText={onChangeText}
      accessibilityLabel="Find people"
      autoFocus
    />,
  );
  expect(view.getByLabelText('Find people').props.autoFocus).toBe(true);
  fireEvent.press(view.getByRole('button', { name: 'Clear search' }));
  expect(onChangeText).toHaveBeenLastCalledWith('');
});

test('search focus and blur forward the exact native event and update the visible focus border', () => {
  const onFocus = jest.fn();
  const onBlur = jest.fn();
  const view = render(<SearchField onFocus={onFocus} onBlur={onBlur} />);
  const event = { nativeEvent: { target: 1 } };
  // The outer host view owns the focus treatment, not an unrelated test replica.
  const border = () => {
    const tree = view.toJSON();
    if (!tree || Array.isArray(tree)) throw new Error('Expected a single search container');
    return StyleSheet.flatten<ViewStyle>(tree.props.style).borderColor;
  };
  expect(border()).toBe(lightColors.border);
  fireEvent(view.getByLabelText('Search'), 'focus', event);
  expect(onFocus).toHaveBeenCalledWith(event);
  expect(border()).toBe(lightColors.primary);
  fireEvent(view.getByLabelText('Search'), 'blur', event);
  expect(onBlur).toHaveBeenCalledWith(event);
  expect(border()).toBe(lightColors.border);
});

test('optional search callbacks can be omitted safely', () => {
  const view = render(<SearchField value="readonly" />);
  fireEvent(view.getByLabelText('Search'), 'focus', {});
  fireEvent(view.getByLabelText('Search'), 'blur', {});
  fireEvent.press(view.getByRole('button', { name: 'Clear search' }));
  expect(view.getByLabelText('Search').props.value).toBe('readonly');
});

test.each(['number-pad', 'numeric', 'decimal-pad', 'phone-pad'] as const)(
  '%s does not introduce a duplicate Done control',
  (keyboardType) => {
    const view = render(<Input label="Amount" keyboardType={keyboardType} />);
    expect(view.getByLabelText('Amount').props.returnKeyType).toBeUndefined();
  },
);

test.each([false, true])(
  'single-line submit dismisses the keyboard and forwards the event (password=%s)',
  (secureTextEntry) => {
    const dismiss = jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => {});
    const onSubmitEditing = jest.fn();
    const view = render(
      <Input label="Value" secureTextEntry={secureTextEntry} onSubmitEditing={onSubmitEditing} />,
    );
    const field = view.getByLabelText('Value');
    expect(field.props.returnKeyType).toBe('done');
    expect(field.props.blurOnSubmit).toBe(true);
    const event = { nativeEvent: { text: 'value' } };
    fireEvent(field, 'submitEditing', event);
    expect(dismiss).toHaveBeenCalledTimes(1);
    expect(onSubmitEditing).toHaveBeenCalledWith(event);
  },
);

test('multiline submit retains the keyboard and honors explicit return and blur behavior', () => {
  const dismiss = jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => {});
  const view = render(<Input label="Description" multiline />);
  expect(view.getByLabelText('Description').props.returnKeyType).toBeUndefined();
  expect(view.getByLabelText('Description').props.blurOnSubmit).toBeUndefined();
  fireEvent(view.getByLabelText('Description'), 'submitEditing', {});
  expect(dismiss).not.toHaveBeenCalled();
  view.rerender(<Input label="Description" multiline returnKeyType="send" blurOnSubmit={false} />);
  expect(view.getByLabelText('Description').props).toMatchObject({
    returnKeyType: 'send',
    blurOnSubmit: false,
  });
});

test('form errors take precedence over success and hints, and disabled state has an accessible label', () => {
  const view = render(
    <Input
      label="Email"
      accessibilityLabel="Business email"
      error="Invalid"
      success="Saved"
      hint="Enter email"
      editable={false}
    />,
  );
  expect(view.getByLabelText('Business email').props.accessibilityState.disabled).toBe(true);
  expect(view.getByText('Invalid')).toHaveStyle({ color: lightColors.error });
  expect(view.getByLabelText('Business email')).toHaveStyle({ borderColor: lightColors.error });
  expect(view.queryByText('Saved')).toBeNull();
  expect(view.queryByText('Enter email')).toBeNull();
  view.rerender(<Input label="Email" success="Saved" hint="Enter email" />);
  expect(view.getByText('Saved')).toHaveStyle({ color: lightColors.success });
  view.rerender(<Input label="Email" hint="Enter email" />);
  expect(view.getByText('Enter email')).toHaveStyle({ color: lightColors.textTertiary });
});

test('password controls keep a single-line input and preserve caller blur and return settings', () => {
  jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => {});
  const view = render(
    <Input
      label="Password"
      secureTextEntry
      multiline
      error="Try again"
      blurOnSubmit={false}
      returnKeyType="next"
    />,
  );
  expect(view.getByLabelText('Password').props).toMatchObject({
    multiline: false,
    blurOnSubmit: false,
    returnKeyType: 'next',
  });
  expect(view.getByText('Try again')).toBeTruthy();
  fireEvent(view.getByLabelText('Password'), 'submitEditing', {});
});

test('inline errors announce their context and remain until the caller changes them', () => {
  const announce = jest
    .spyOn(AccessibilityInfo, 'announceForAccessibility')
    .mockImplementation(() => {});
  const view = render(
    <InlineFeedback title="Could not save" message="Try again." testID="feedback" />,
  );
  expect(view.getByTestId('feedback').props).toMatchObject({
    accessible: true,
    accessibilityRole: 'alert',
    accessibilityLiveRegion: 'assertive',
  });
  expect(announce).toHaveBeenLastCalledWith('Could not save. Try again.');
  view.rerender(<InlineFeedback message="Still unavailable." testID="feedback" />);
  expect(announce).toHaveBeenLastCalledWith('Still unavailable.');
  expect(view.getByText('Still unavailable.')).toBeTruthy();
  expect(view.queryByText('Could not save')).toBeNull();
});

test.each(['success', 'info'] as const)(
  '%s feedback uses polite announcements without an error alert',
  (tone) => {
    const announce = jest
      .spyOn(AccessibilityInfo, 'announceForAccessibility')
      .mockImplementation(() => {});
    const view = render(
      <InlineFeedback tone={tone} message="Updated" testID="feedback" style={{ marginTop: 9 }} />,
    );
    expect(view.getByTestId('feedback').props.accessibilityRole).toBeUndefined();
    expect(view.getByTestId('feedback').props.accessibilityLiveRegion).toBe('polite');
    expect(view.getByTestId('feedback')).toHaveStyle({ marginTop: 9 });
    expect(view.getByText('Updated')).toHaveStyle({
      color: tone === 'success' ? lightColors.success : lightColors.link,
    });
    expect(announce).not.toHaveBeenCalled();
  },
);
