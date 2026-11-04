import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';
import { useAuthStore } from '../stores/useAuthStore';
import {
  mobileDiagnosticSnapshot,
  takeWorkflowOutcomeCounts,
} from '../lib/mobileDiagnosticContext';
import { createMobileWorkflowReporter } from '../lib/mobileWorkflowReporter';
import { newCommandId } from '../lib/idempotency';

/** Independent optional diagnostics; never awaited by auth, reads, submissions or navigation. */
export function MobileWorkflowReporting() {
  const userId = useAuthStore((state) => state.session?.user.id);
  useEffect(() => {
    if (
      process.env.EXPO_PUBLIC_WORKFLOW_REPORTING_ENABLED !== 'true' ||
      (Platform.OS !== 'ios' && Platform.OS !== 'android') ||
      !userId
    )
      return;
    const platform = Platform.OS;
    const reporter = createMobileWorkflowReporter({
      enabled: true,
      environment: process.env.EXPO_PUBLIC_WORKFLOW_REPORTING_ENVIRONMENT ?? '',
      url: process.env.EXPO_PUBLIC_SUPABASE_URL ?? '',
      now: Date.now,
      fetch,
      take: takeWorkflowOutcomeCounts,
      id: () => newCommandId('wf'),
      current: () => {
        const session = useAuthStore.getState().session;
        const diagnostic = mobileDiagnosticSnapshot();
        return session?.user.id === userId && typeof diagnostic.session_id === 'string'
          ? { session: diagnostic.session_id, token: session.access_token, platform }
          : null;
      },
    });
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void reporter.foreground().catch(() => undefined);
    });
    return () => {
      subscription.remove();
      reporter.dispose();
    };
  }, [userId]);
  return null;
}
