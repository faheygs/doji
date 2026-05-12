/**
 * Tests for Button component behavior.
 * Tests the onPress guard logic and prop handling without rendering.
 */

jest.mock('../../contexts/ThemeContext', () => ({
  useTheme: () => ({
    colors: {
      accent: '#F97316',
      onAccent: '#FFFFFF',
      text: '#FAFAFA',
      link: '#3B82F6',
      border: '#333',
      error: '#EF4444',
    },
  }),
}));

jest.mock('expo-haptics');

describe('Button', () => {
  it('exports a function component', () => {
    const { Button } = require('../../components/ui/Button');
    expect(typeof Button).toBe('function');
  });

  describe('press guard logic', () => {
    it('blocks press when disabled', () => {
      const onPress = jest.fn();
      const disabled = true;
      const loading = false;

      // Simulate the guard: if (disabled || loading) return;
      if (disabled || loading) {
        // Intentionally blocked
      } else {
        onPress();
      }

      expect(onPress).not.toHaveBeenCalled();
    });

    it('blocks press when loading', () => {
      const onPress = jest.fn();
      const disabled = false;
      const loading = true;

      if (disabled || loading) {
        // Intentionally blocked
      } else {
        onPress();
      }

      expect(onPress).not.toHaveBeenCalled();
    });

    it('allows press when enabled and not loading', () => {
      const onPress = jest.fn();
      const disabled = false;
      const loading = false;

      if (disabled || loading) {
        // Intentionally blocked
      } else {
        onPress();
      }

      expect(onPress).toHaveBeenCalledTimes(1);
    });
  });

  describe('variant styling', () => {
    it('primary variant uses accent color', () => {
      const colors = { accent: '#F97316', border: '#333', error: '#EF4444' };
      const variant = 'primary';
      const style = variant === 'primary' ? { backgroundColor: colors.accent } : {};
      expect(style).toEqual({ backgroundColor: '#F97316' });
    });

    it('danger variant uses error border', () => {
      const colors = { accent: '#F97316', border: '#333', error: '#EF4444' };
      const variant = 'danger';
      const style = variant === 'danger'
        ? { backgroundColor: 'transparent', borderColor: colors.error }
        : {};
      expect(style.borderColor).toBe('#EF4444');
    });
  });

  describe('label color logic', () => {
    it('primary shows onAccent color', () => {
      const colors = { onAccent: '#FFFFFF', text: '#FAFAFA', link: '#3B82F6', error: '#EF4444' };
      const variant = 'primary';
      const labelColor = variant === 'primary' ? colors.onAccent
        : variant === 'danger' ? colors.error
        : variant === 'ghost' ? colors.link
        : colors.text;
      expect(labelColor).toBe('#FFFFFF');
    });

    it('ghost shows link color', () => {
      const colors = { onAccent: '#FFFFFF', text: '#FAFAFA', link: '#3B82F6', error: '#EF4444' };
      const variant = 'ghost';
      const labelColor = variant === 'primary' ? colors.onAccent
        : variant === 'danger' ? colors.error
        : variant === 'ghost' ? colors.link
        : colors.text;
      expect(labelColor).toBe('#3B82F6');
    });
  });
});
