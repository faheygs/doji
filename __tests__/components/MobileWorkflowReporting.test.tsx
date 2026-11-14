import React from 'react';
import { act, cleanup, render } from '@testing-library/react-native';
import { AppState, Platform } from 'react-native';
import { MobileWorkflowReporting } from '../../components/MobileWorkflowReporting';
import { createMobileWorkflowReporter } from '../../lib/mobileWorkflowReporter';
let mockUser: string | null = 'synthetic-member';
const mockForeground = jest.fn().mockResolvedValue(undefined),
  mockDispose = jest.fn();
jest.mock('../../lib/mobileWorkflowReporter', () => ({
  createMobileWorkflowReporter: jest.fn(() => ({
    foreground: mockForeground,
    dispose: mockDispose,
  })),
}));
jest.mock('../../lib/mobileDiagnosticContext', () => ({
  mobileDiagnosticSnapshot: () => ({ session_id: 'synthetic-session' }),
  takeWorkflowOutcomeCounts: () => [],
}));
jest.mock('../../stores/useAuthStore', () => ({
  useAuthStore: Object.assign(
    (selector: (state: unknown) => unknown) =>
      selector({
        session: mockUser ? { user: { id: mockUser }, access_token: 'synthetic-token' } : null,
      }),
    {
      getState: () => ({
        session: mockUser ? { user: { id: mockUser }, access_token: 'synthetic-token' } : null,
      }),
    },
  ),
}));
const original = Platform.OS;
const remove = jest.fn();
let listener: (state: string) => void;
beforeEach(() => {
  jest.clearAllMocks();
  mockUser = 'synthetic-member';
  process.env.EXPO_PUBLIC_WORKFLOW_REPORTING_ENABLED = 'true';
  Object.defineProperty(Platform, 'OS', { configurable: true, value: 'ios' });
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, callback) => {
    listener = callback as (state: string) => void;
    return { remove };
  });
});
afterEach(() => {
  cleanup();
  jest.restoreAllMocks();
  delete process.env.EXPO_PUBLIC_WORKFLOW_REPORTING_ENABLED;
  Object.defineProperty(Platform, 'OS', { configurable: true, value: original });
});
test.each(['disabled', 'web', 'signed-out'])('%s has no listener or transport', (value) => {
  if (value === 'disabled') delete process.env.EXPO_PUBLIC_WORKFLOW_REPORTING_ENABLED;
  if (value === 'web') Object.defineProperty(Platform, 'OS', { configurable: true, value: 'web' });
  if (value === 'signed-out') mockUser = null;
  render(<MobileWorkflowReporting />);
  expect(AppState.addEventListener).not.toHaveBeenCalled();
  expect(createMobileWorkflowReporter).not.toHaveBeenCalled();
});
test.each(['ios', 'android'])(
  '%s foreground only, fresh token lookup, account fence and cleanup',
  async (platform) => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: platform });
    const view = render(<MobileWorkflowReporting />);
    expect(mockForeground).not.toHaveBeenCalled();
    await act(async () => listener('background'));
    expect(mockForeground).not.toHaveBeenCalled();
    await act(async () => listener('active'));
    expect(mockForeground).toHaveBeenCalledTimes(1);
    const deps = jest.mocked(createMobileWorkflowReporter).mock.calls[0]![0];
    expect(deps.current()).toEqual({
      session: 'synthetic-session',
      token: 'synthetic-token',
      platform,
    });
    expect(deps.id()).toMatch(/^wf:/);
    expect(deps.take()).toEqual([]);
    mockUser = 'other-account';
    expect(deps.current()).toBeNull();
    view.unmount();
    expect(remove).toHaveBeenCalledTimes(1);
    expect(mockDispose).toHaveBeenCalledTimes(1);
  },
);
