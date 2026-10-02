import React from 'react';
import { Modal, Platform, Text } from 'react-native';
import { act, render } from '@testing-library/react-native';
import { AppSheetModal } from '../../components/ui/AppSheetModal';
import { KeyboardToolbarProvider } from '../../contexts/KeyboardToolbarContext';

test('iOS handoff waits for native dismissal, not a render or animation frame', () => {
  const prior = Platform.OS;
  Object.defineProperty(Platform, 'OS', { configurable: true, value: 'ios' });
  const dismissed = jest.fn();
  const tree = (visible: boolean) => <KeyboardToolbarProvider>
    <AppSheetModal visible={visible} nativeDismissal onClose={() => {}} onDismiss={dismissed}>
      <Text>Sheet</Text>
    </AppSheetModal>
  </KeyboardToolbarProvider>;
  const view = render(tree(true));
  view.rerender(tree(false));
  expect(dismissed).not.toHaveBeenCalled();
  const modal = view.UNSAFE_getByType(Modal);
  expect(modal.props.visible).toBe(false);
  act(() => modal.props.onDismiss());
  expect(dismissed).toHaveBeenCalledTimes(1);
  view.unmount();
  Object.defineProperty(Platform, 'OS', { configurable: true, value: prior });
});

test('ordinary closed sheets still unmount instead of retaining a touch blocker', () => {
  const tree = (visible: boolean) => <KeyboardToolbarProvider>
    <AppSheetModal visible={visible} onClose={() => {}}><Text>Sheet</Text></AppSheetModal>
  </KeyboardToolbarProvider>;
  const view = render(tree(true));
  view.rerender(tree(false));
  expect(view.UNSAFE_queryAllByType(Modal)).toHaveLength(0);
  view.unmount();
});
