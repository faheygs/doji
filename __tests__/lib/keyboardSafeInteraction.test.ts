import {
  getKeyboardAvoidanceInset,
  getKeyboardDismissTarget,
  getKeyboardStickyFooterOpenedOffset,
  getKeyboardToolbarOpenedOffset,
} from '../../lib/keyboardSafeInteraction';

describe('keyboard-safe interaction', () => {
  it('uses the full keyboard height when the window does not resize', () => {
    expect(
      getKeyboardAvoidanceInset({
        keyboardHeight: 300,
        initialWindowHeight: 812,
        currentWindowHeight: 812,
      }),
    ).toBe(300);
  });

  it('does not add a duplicate inset when Android already resized the window', () => {
    expect(
      getKeyboardAvoidanceInset({
        keyboardHeight: 300,
        initialWindowHeight: 812,
        currentWindowHeight: 512,
      }),
    ).toBe(0);
  });

  it('adds only the remaining overlay after a partial window resize', () => {
    expect(
      getKeyboardAvoidanceInset({
        keyboardHeight: 300,
        initialWindowHeight: 812,
        currentWindowHeight: 612,
      }),
    ).toBe(100);
  });

  it('dismisses the keyboard before the sheet', () => {
    expect(getKeyboardDismissTarget(true, true)).toBe('keyboard');
    expect(getKeyboardDismissTarget(true, false)).toBe('sheet');
  });

  it('allows explicitly non-keyboard-aware sheets to close immediately', () => {
    expect(getKeyboardDismissTarget(false, true)).toBe('sheet');
  });

  it('does not double-count the safe area when positioning the keyboard toolbar', () => {
    expect(getKeyboardToolbarOpenedOffset(false)).toBe(0);
    expect(getKeyboardToolbarOpenedOffset(true)).toBe(11);
  });

  it('moves fixed footers above the keyboard toolbar', () => {
    expect(getKeyboardStickyFooterOpenedOffset(62)).toBe(-62);
    expect(getKeyboardStickyFooterOpenedOffset(-10)).toBe(0);
  });
});
