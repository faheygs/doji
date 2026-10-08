import { AppState, Platform } from 'react-native';
import { initializeDiagnosticInstallation, observeDiagnosticAppState, observeDiagnosticNetwork,
  recordDiagnosticMemoryWarning } from './mobileDiagnosticContext';
import { syncMobileDiagnosticTags } from './mobileDiagnosticSentry';

/** Passive native observations only; no polling, reachability fetches or query gating. */
export function startMobileDiagnosticObservers(): () => void {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') return () => {};
  void initializeDiagnosticInstallation().then(syncMobileDiagnosticTags).catch(() => {});
  let Network: typeof import('expo-network') | undefined;
  try { Network = require('expo-network'); } catch { /* An older binary may lack this optional native module. */ }
  let alive = true, revision = 0;
  const cleanups: (() => void)[] = [];
  const snapshot = () => {
    const requested = ++revision;
    try {
      void Network?.getNetworkStateAsync().then(state => {
        if (alive && revision === requested) observeDiagnosticNetwork(state);
      }).catch(() => {});
    } catch { /* optional native module */ }
  };
  observeDiagnosticAppState(AppState.currentState);
  try {
    const subscription = Network?.addNetworkStateListener(state => {
      if (!alive) return;
      revision += 1; observeDiagnosticNetwork(state);
    });
    if (subscription) cleanups.push(() => subscription.remove());
  } catch { /* old binary: missing module is not an app failure */ }
  try {
    const state = AppState.addEventListener('change', value => {
      if (!alive) return;
      observeDiagnosticAppState(value);
      if (value === 'active') snapshot();
    });
    cleanups.push(() => state.remove());
    const memory = AppState.addEventListener('memoryWarning', () => { if (alive) recordDiagnosticMemoryWarning(); });
    cleanups.push(() => memory.remove());
  } catch { /* observation must not affect app lifecycle */ }
  snapshot();
  return () => { alive = false; revision += 1; for (const cleanup of cleanups) { try { cleanup(); } catch { /* optional */ } } };
}
