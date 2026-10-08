import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { newCommandId } from './idempotency';
import { safeDiagnosticOperation } from './diagnosticOperations';

// Diagnostic correlation only: never reuse auth, push, advertising or hardware IDs.
const INSTALLATION_KEY = '@doji/diagnostic-installation:v1';
const validId = (value: unknown): value is string => typeof value === 'string' && /^diag:[a-z0-9:-]{10,170}$/.test(value);
const freshId = () => newCommandId('diag');
const native = () => Platform.OS === 'ios' || Platform.OS === 'android';
const bounded = (value: number, max = 86_400_000) => Math.min(max, Math.max(0, Math.round(value)));
type Scalar = string | number | boolean;
type TimelineItem = { timestamp: number; category: string; data: Record<string, Scalar> };
type Network = { type: string; connected: boolean | 'unknown'; reachable: boolean | 'unknown'; at: number };
const networkTypes = new Set(['NONE', 'UNKNOWN', 'CELLULAR', 'WIFI', 'BLUETOOTH', 'ETHERNET', 'WIMAX', 'VPN', 'OTHER']);
let installation: string | undefined;
let installationStorage = 'pending';
let installationReady: Promise<void> | undefined;
let session = freshId();
let actor: string | null | undefined;
let sessionStarted = Date.now();
let screen = 'startup';
let appState = 'unknown';
let stateChangedAt = Date.now();
let network: Network = { type: 'UNKNOWN', connected: 'unknown', reachable: 'unknown', at: 0 };
let networkChanges = 0, lifecycleChanges = 0;
let timeline: TimelineItem[] = [];

function record(category: string, data: Record<string, Scalar>) {
  if (!native()) return;
  timeline.push({ timestamp: Date.now() / 1000, category: `diagnostic.${category}`, data });
  timeline = timeline.slice(-24);
}

/** Non-blocking and single-flight. Failure to persist never prevents app startup. */
export function initializeDiagnosticInstallation(): Promise<void> {
  if (!native()) return Promise.resolve();
  return installationReady ??= (async () => {
    try {
      const saved = await AsyncStorage.getItem(INSTALLATION_KEY);
      installation = validId(saved) ? saved : freshId();
      if (!validId(saved)) await AsyncStorage.setItem(INSTALLATION_KEY, installation);
      installationStorage = 'persisted';
    } catch { installation ??= freshId(); installationStorage = 'memory_only'; }
  })();
}

/** The actor is compared in memory only; it is NEVER returned or transmitted. */
export function setDiagnosticActor(next: string | null): void {
  if (actor === next) return;
  actor = next; session = freshId(); sessionStarted = Date.now(); timeline = [];
  record('session', { authenticated: next !== null });
}

// Segments must match a code-owned route template; raw paths/params never leave here.
const screens = new Set(['(app)/(tabs)', '(app)/(tabs)/friends', '(app)/(tabs)/profile',
  '(app)/(tabs)/rank', '(app)/(tabs)/suggest-challenge', '(app)/challenge', '(app)/task',
  '(app)/poll', '(app)/camera', '(app)/format', '(app)/notifications', '(app)/post/[id]',
  '(app)/member/[username]', '(app)/profile/shop', '(app)/profile/settings', '(app)/profile/edit',
  '(app)/profile/blocked-users', '(app)/profile/appearance', '(app)/profile/account-status',
  '(app)/friends/requests', '(app)/friends/add', '(app)/legal/terms', '(app)/legal/privacy',
  '(app)/admin/reports', '(app)/admin/suggestions', '(auth)/login', '(auth)/welcome',
  '(auth)/username', '(auth)/terms', '(auth)/privacy', '(onboarding)', '(onboarding)/notifications',
  '(onboarding)/how-it-works', 'banned']);
export function setDiagnosticScreen(segments: readonly string[]): void {
  const path = segments.filter(s => s !== 'index').join('/');
  const next = screens.has(path) ? path : path === '' ? 'startup' : 'other';
  if (next === screen) return;
  screen = next; record('navigation', { screen });
}
export function observeDiagnosticAppState(value: unknown): void {
  const next = value === 'active' || value === 'background' || value === 'inactive' ? value : 'unknown';
  if (next === appState) return;
  appState = next; stateChangedAt = Date.now(); lifecycleChanges += 1;
  record('lifecycle', { state: next });
}
export function observeDiagnosticNetwork(value: { type?: unknown; isConnected?: unknown; isInternetReachable?: unknown }): void {
  const next = { type: typeof value.type === 'string' && networkTypes.has(value.type) ? value.type : 'UNKNOWN',
    connected: typeof value.isConnected === 'boolean' ? value.isConnected : 'unknown' as const,
    reachable: typeof value.isInternetReachable === 'boolean' ? value.isInternetReachable : 'unknown' as const,
    at: Date.now() };
  if (next.type !== network.type || next.connected !== network.connected || next.reachable !== network.reachable) {
    networkChanges += 1; record('network', { type: next.type, connected: next.connected, reachable: next.reachable });
  }
  network = next;
}
export function recordDiagnosticMemoryWarning(): void { record('memory', { warning: true }); }

/** Callers supply only allowlisted operation names and fixed outcomes, never query keys. */
export function recordDiagnosticOutcome(operation: string, outcome: 'failed' | 'recovered' | 'success' | 'cancelled', attempts: number): void {
  record('request', { operation: safeDiagnosticOperation(operation), outcome, attempts: bounded(attempts, 100) });
}
export function mobileDiagnosticSnapshot(): Record<string, Scalar> {
  if (!native()) return {};
  return { schema_version: 1, platform: Platform.OS, ...(installation ? { installation_id: installation } : {}),
    installation_storage: installationStorage, session_id: session, authenticated: actor != null, screen,
    session_age_ms: bounded(Date.now() - sessionStarted), app_state: appState,
    state_age_ms: bounded(Date.now() - stateChangedAt), lifecycle_changes: lifecycleChanges,
    network_type: network.type, network_connected: network.connected,
    network_reachable: network.reachable, network_sample_age_ms: network.at ? bounded(Date.now() - network.at) : -1,
    network_changes: networkChanges, network_evidence: 'os_observation_not_server_probe' };
}
export function diagnosticTimeline(): TimelineItem[] {
  return timeline.map(item => ({ ...item, data: { ...item.data } }));
}
export function diagnosticSessionIsCurrent(id: unknown): boolean { return id === session; }

/** Keep safe SDK-native facts. Explicitly exclude device names, IDs, IPs and locale. */
export function safeNativeDiagnosticContexts(contexts: Record<string, unknown> | undefined): Record<string, Record<string, Scalar>> {
  const result: Record<string, Record<string, Scalar>> = {};
  for (const [name, fields] of Object.entries({
    device: ['manufacturer', 'brand', 'family', 'model', 'model_id', 'arch', 'orientation',
      'simulator', 'online', 'charging', 'battery_level', 'low_memory', 'memory_size', 'free_memory',
      'usable_memory', 'storage_size', 'free_storage', 'processor_count'],
    os: ['name', 'version', 'build', 'kernel_version', 'rooted'],
    app: ['app_identifier', 'app_version', 'app_build', 'in_foreground'],
  })) {
    const source = contexts?.[name];
    if (!source || typeof source !== 'object') continue;
    const selected: Record<string, Scalar> = {};
    for (const key of fields) {
      const value = (source as Record<string, unknown>)[key];
      if (typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))) selected[key] = value;
      else if (typeof value === 'string' && value.length <= 100 && /^[a-zA-Z0-9 ._+(),:/-]+$/.test(value)) selected[key] = value;
    }
    if (Object.keys(selected).length) result[name] = selected;
  }
  return result;
}
