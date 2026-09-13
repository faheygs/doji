import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { Input } from '../../components/ui/Input';

jest.mock('../../contexts/ThemeContext', () => ({
  useTheme: () => ({
    colors: {
      fillMuted: '#eeeeee',
      text: '#111111',
      textSecondary: '#555555',
      textTertiary: '#777777',
      error: '#cc0000',
      success: '#008800',
      link: '#0000cc',
    },
    isDark: false,
  }),
}));

describe('Input password visibility', () => {
  it('starts concealed and toggles between showing and hiding the password', () => {
    const screen = render(
      <Input label="Password" value="secret123" secureTextEntry testID="password-field" />,
    );

    expect(screen.getByTestId('password-field').props.secureTextEntry).toBe(true);
    fireEvent.press(screen.getByLabelText('Show password'));
    expect(screen.getByTestId('password-field').props.secureTextEntry).toBe(false);
    fireEvent.press(screen.getByLabelText('Hide password'));
    expect(screen.getByTestId('password-field').props.secureTextEntry).toBe(true);
  });

  it('does not add a visibility control to ordinary text fields', () => {
    const screen = render(<Input label="Email" value="person@example.com" />);
    expect(screen.queryByTestId('password-visibility-toggle')).toBeNull();
  });
});
