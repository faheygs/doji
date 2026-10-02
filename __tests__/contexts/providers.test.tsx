import React from 'react';
import { Keyboard } from 'react-native';
import { act, cleanup, renderHook } from '@testing-library/react-native';
import { DialogProvider, useAppDialog } from '../../contexts/DialogContext';
import { ReportFlowProvider, useReportFlow } from '../../contexts/ReportFlowContext';
import {
  KeyboardToolbarProvider,
  useKeyboardToolbarHost,
} from '../../contexts/KeyboardToolbarContext';
import {
  NavigationOriginProvider,
  useNavigationOrigin,
} from '../../contexts/NavigationOriginContext';
import {
  NotificationCenterProvider,
  useNotificationCenterContext,
} from '../../contexts/NotificationCenterContext';
import type { AppDialogOptions } from '../../components/ui/AppDialog';
import type { ReportSubject } from '../../components/feed/ReportSheet';

let mockPath = '/profile/synthetic';
let mockParams: { returnTo?: string | string[] } = {};
let mockDialog: AppDialogOptions & { visible: boolean; onDismiss: () => void };
let mockReport: ReportSubject & { visible: boolean; onClose: () => void };
const mockNotification = { unreadCount: 3, refresh: jest.fn() };
const mockNotificationHook = jest.fn(() => mockNotification);
jest.mock('expo-router', () => ({
  usePathname: () => mockPath,
  useLocalSearchParams: () => mockParams,
}));
// Presentation boundaries only; each provider below executes its actual state/lifecycle code.
jest.mock('../../components/ui/AppDialog', () => ({
  AppDialog: (props: typeof mockDialog) => {
    mockDialog = props;
    return null;
  },
}));
jest.mock('../../components/feed/ReportSheet', () => ({
  ReportSheet: (props: typeof mockReport) => {
    mockReport = props;
    return null;
  },
}));
jest.mock('../../hooks/useNotificationCenter', () => ({
  useNotificationCenter: () => mockNotificationHook(),
}));
beforeEach(() => {
  jest.clearAllMocks();
  mockPath = '/profile/synthetic';
  mockParams = {};
});
afterEach(() => {
  cleanup();
  jest.restoreAllMocks();
});

test.each([
  ['dialog', useAppDialog, 'useAppDialog must be used inside DialogProvider'],
  ['report', useReportFlow, 'ReportFlowProvider is required'],
  [
    'keyboard',
    useKeyboardToolbarHost,
    'useKeyboardToolbarHost must be used inside KeyboardToolbarProvider',
  ],
  ['notifications', useNotificationCenterContext, 'NotificationCenterProvider is missing'],
] as const)('%s consumer fails explicitly outside its provider', (_name, hook, message) => {
  const error = jest.spyOn(console, 'error').mockImplementation(() => {});
  try {
    expect(() => renderHook(() => hook())).toThrow(message);
  } finally {
    error.mockRestore();
  }
});

test('dialog dismisses keyboard and preserves title, options and action results', async () => {
  const dismiss = jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => {});
  const action = jest.fn(async () => {});
  const { result } = renderHook(useAppDialog, { wrapper: DialogProvider });
  expect(mockDialog).toMatchObject({ visible: false, title: '', actions: [] });
  act(() =>
    result.current.showDialog({
      title: 'Confirm',
      message: 'Synthetic message',
      layout: 'stacked',
      dismissible: false,
      actions: [{ label: 'Accept', variant: 'destructive', onPress: action }],
    }),
  );
  expect(dismiss).toHaveBeenCalledTimes(1);
  expect(mockDialog).toMatchObject({
    visible: true,
    title: 'Confirm',
    message: 'Synthetic message',
    layout: 'stacked',
    dismissible: false,
  });
  await act(async () => {
    await mockDialog.actions[0].onPress?.();
  });
  expect(action).toHaveBeenCalledTimes(1);
  expect(mockDialog.visible).toBe(false);
});

test('dialog actions without callbacks and explicit dismissal both close the dialog', () => {
  const { result } = renderHook(useAppDialog, { wrapper: DialogProvider });
  act(() => result.current.showDialog({ title: 'Notice', actions: [{ label: 'OK' }] }));
  act(() => mockDialog.actions[0].onPress?.());
  expect(mockDialog.visible).toBe(false);
  act(() => result.current.showDialog({ title: 'Again', actions: [] }));
  act(() => mockDialog.onDismiss());
  expect(mockDialog.visible).toBe(false);
});

test('navigation dismisses a stale dialog without invoking its action', () => {
  const action = jest.fn();
  const { result, rerender } = renderHook(useAppDialog, { wrapper: DialogProvider });
  act(() =>
    result.current.showDialog({
      title: 'First screen',
      actions: [{ label: 'Delete', onPress: action }],
    }),
  );
  mockPath = '/settings';
  rerender({});
  expect(mockDialog.visible).toBe(false);
  expect(action).not.toHaveBeenCalled();
});

test('report flow prevents same-tick duplicate opens and changes target only after closing', () => {
  const { result } = renderHook(useReportFlow, { wrapper: ReportFlowProvider });
  act(() => {
    result.current({ reportedUserId: 'first', postId: 'post-a' });
    result.current({ reportedUserId: 'second', postId: 'post-b' });
  });
  expect(mockReport).toMatchObject({ reportedUserId: 'first', postId: 'post-a', visible: true });
  act(() => mockReport.onClose());
  expect(mockReport.visible).toBe(false);
  act(() => result.current({ reportedUserId: 'second', postId: 'post-b' }));
  expect(mockReport).toMatchObject({ reportedUserId: 'second', postId: 'post-b', visible: true });
});

test('keyboard overlay owners release independently and cleanup is idempotent', () => {
  const { result } = renderHook(useKeyboardToolbarHost, { wrapper: KeyboardToolbarProvider });
  expect(result.current.overlayOwnerCount).toBe(0);
  let first!: () => void;
  let second!: () => void;
  act(() => {
    first = result.current.registerOverlayOwner();
    second = result.current.registerOverlayOwner();
  });
  expect(result.current.overlayOwnerCount).toBe(2);
  act(() => {
    first();
    first();
  });
  expect(result.current.overlayOwnerCount).toBe(1);
  act(() => {
    second();
    second();
  });
  expect(result.current.overlayOwnerCount).toBe(0);
});

test('navigation origin preserves a valid parent and updates when the route changes', () => {
  mockParams = { returnTo: '/settings' };
  const { result, rerender } = renderHook(useNavigationOrigin);
  expect(result.current).toBe('/profile/synthetic?returnTo=%2Fsettings');
  mockPath = '/friends';
  mockParams = {};
  rerender({});
  expect(result.current).toBe('/friends');
});

test('explicit navigation provider retains extra route state', () => {
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <NavigationOriginProvider origin="/post/one?thread=two">{children}</NavigationOriginProvider>
  );
  const { result } = renderHook(useNavigationOrigin, { wrapper });
  expect(result.current).toBe('/post/one?thread=two');
});

test('notification consumers share the provider hook rather than creating independent requests', () => {
  const { result, rerender } = renderHook(
    () => [useNotificationCenterContext(), useNotificationCenterContext()],
    { wrapper: NotificationCenterProvider },
  );
  expect(result.current[0]).toBe(mockNotification);
  expect(result.current[1]).toBe(mockNotification);
  expect(mockNotificationHook).toHaveBeenCalledTimes(1);
  mockNotification.unreadCount = 0;
  rerender({});
  expect(result.current[0].unreadCount).toBe(0);
});
