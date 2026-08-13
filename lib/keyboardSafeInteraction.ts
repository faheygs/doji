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

/**
 * The controller already accounts for the rounded iOS keyboard gap. Page
 * sheets need to neutralize that built-in gap; full-screen routes do not.
 */
export function getKeyboardToolbarOpenedOffset(insidePageSheet: boolean): number {
  return insidePageSheet ? 11 : 0;
}

/** Moves a fixed footer above the keyboard toolbar instead of into the keyboard. */
export function getKeyboardStickyFooterOpenedOffset(toolbarClearance: number): number {
  const normalizedClearance = Math.max(0, toolbarClearance);
  return normalizedClearance === 0 ? 0 : -normalizedClearance;
}
