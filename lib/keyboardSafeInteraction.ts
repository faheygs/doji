export type KeyboardDismissTarget = 'keyboard' | 'sheet';

type KeyboardAvoidanceInsetArgs = {
  keyboardHeight: number;
  initialWindowHeight: number;
  currentWindowHeight: number;
};

/**
 * Returns only the part of the keyboard that still overlays app content.
 * Android resize can already remove some or all of the keyboard height from
 * the window, while iOS commonly leaves the window height unchanged.
 */
export function getKeyboardAvoidanceInset({
  keyboardHeight,
  initialWindowHeight,
  currentWindowHeight,
}: KeyboardAvoidanceInsetArgs): number {
  const normalizedKeyboardHeight = Math.max(0, keyboardHeight);
  const windowResizeInset = Math.max(0, initialWindowHeight - currentWindowHeight);

  return Math.max(0, normalizedKeyboardHeight - windowResizeInset);
}

export function getKeyboardDismissTarget(
  keyboardAwareDismiss: boolean,
  keyboardVisible: boolean,
): KeyboardDismissTarget {
  return keyboardAwareDismiss && keyboardVisible ? 'keyboard' : 'sheet';
}

/** Keep the controller's native rounded-keyboard gap on every app surface. */
export function getKeyboardToolbarOpenedOffset(): number {
  return 0;
}

/**
 * KeyboardToolbar adds its own height to the closed translation. Rounded
 * iPhones can retain the home-indicator inset in the native keyboard height,
 * so clear that inset plus a small shadow buffer as well.
 */
export function getKeyboardToolbarClosedOffset(bottomInset: number): number {
  return Math.max(0, bottomInset) + 8;
}

/** Moves a fixed footer above the keyboard toolbar instead of into the keyboard. */
export function getKeyboardStickyFooterOpenedOffset(toolbarClearance: number): number {
  const normalizedClearance = Math.max(0, toolbarClearance);
  return normalizedClearance === 0 ? 0 : -normalizedClearance;
}
