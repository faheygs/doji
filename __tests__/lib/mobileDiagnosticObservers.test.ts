import { AppState, Platform } from 'react-native';
import * as Network from 'expo-network';
import { startMobileDiagnosticObservers } from '../../lib/mobileDiagnosticObservers';
import { mobileDiagnosticSnapshot, diagnosticTimeline, setDiagnosticActor } from '../../lib/mobileDiagnosticContext';

jest.mock('expo-network', () => ({ getNetworkStateAsync: jest.fn(), addNetworkStateListener: jest.fn() }));
const originalOS = Platform.OS;
let listeners: Record<string, (value: any) => void>;
let networkListener: (state: any) => void;
let remove: jest.Mock;
beforeEach(() => {
  jest.clearAllMocks();
  Object.defineProperty(Platform, 'OS', { configurable: true, value: 'ios' });
  listeners = {}; remove = jest.fn();
  setDiagnosticActor(String(Math.random()));
  jest.spyOn(AppState, 'addEventListener').mockImplementation((type, listener) => {
    listeners[type] = listener; return { remove };
  });
  (Network.addNetworkStateListener as jest.Mock).mockImplementation(listener => { networkListener = listener; return { remove }; });
});
afterEach(() => { jest.restoreAllMocks(); Object.defineProperty(Platform, 'OS', { configurable: true, value: originalOS }); });

test.each(['ios', 'android'])('passive observation has no timers; stale initial/foreground callbacks cannot overwrite newer events (%s)', async platform => {
  Object.defineProperty(Platform, 'OS', { configurable: true, value: platform });
  const pending: ((value: any) => void)[] = [];
  (Network.getNetworkStateAsync as jest.Mock).mockImplementation(() => new Promise(resolve => { pending.push(resolve); }));
  const stop = startMobileDiagnosticObservers();
  networkListener({ type: 'WIFI', isConnected: true, isInternetReachable: true });
  pending[0]({ type: 'NONE', isConnected: false }); await Promise.resolve();
  expect(mobileDiagnosticSnapshot().network_type).toBe('WIFI');
  listeners.change('background'); listeners.change('active');
  expect(Network.getNetworkStateAsync).toHaveBeenCalledTimes(2);
  networkListener({ type: 'CELLULAR', isConnected: true });
  pending[1]({ type: 'NONE', isConnected: false }); await Promise.resolve();
  expect(mobileDiagnosticSnapshot().network_type).toBe('CELLULAR');
  listeners.memoryWarning(undefined);
  expect(diagnosticTimeline().at(-1)?.category).toBe('diagnostic.memory');
  stop(); expect(remove).toHaveBeenCalledTimes(3);
  networkListener({ type: 'NONE' }); listeners.change('inactive');
  expect(mobileDiagnosticSnapshot().network_type).toBe('CELLULAR');
});

test('unavailable observer and rejected snapshot are harmless; cleanup remains usable', async () => {
  (Network.addNetworkStateListener as jest.Mock).mockImplementation(() => { throw Error('module unavailable'); });
  (Network.getNetworkStateAsync as jest.Mock).mockRejectedValue(Error('snapshot unavailable'));
  const stop = startMobileDiagnosticObservers();
  await Promise.resolve(); await Promise.resolve();
  expect(() => stop()).not.toThrow();
});

test('web never loads native observations', () => {
  Object.defineProperty(Platform, 'OS', { configurable: true, value: 'web' });
  startMobileDiagnosticObservers()();
  expect(Network.getNetworkStateAsync).not.toHaveBeenCalled();
  expect(AppState.addEventListener).not.toHaveBeenCalled();
});
