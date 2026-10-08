import { AppState } from 'react-native';
import { useAuthStore } from '../stores/useAuthStore';
import { abortRegistration, PushRegistrationInterrupted, registrationAbortReason } from './pushRegistrationCancellation';

/** One foreground/account-bound run. No recurring timer or background execution grant. */
export function createPushRegistrationScope(userId: string, parent?: AbortSignal, allowDisabled = false) {
  const controller = new AbortController();
  const initiallyEnabled = useAuthStore.getState().profile?.notification_preferences?.push_enabled !== false;
  const cancel = (reason: 'background' | 'account' | 'superseded' = 'superseded') => {
    abortRegistration(controller, new PushRegistrationInterrupted(reason));
  };
  const check = () => {
    const state = useAuthStore.getState();
    if (state.session?.user?.id !== userId || state.profile?.is_banned === true ||
      ((!allowDisabled || initiallyEnabled) && state.profile?.notification_preferences?.push_enabled === false)) cancel('account');
    else if (AppState.currentState !== 'active') cancel('background');
    return !controller.signal.aborted;
  };
  const fromParent = () => abortRegistration(controller,
    parent ? registrationAbortReason(parent) : new PushRegistrationInterrupted('superseded'));
  const appSubscription = AppState.addEventListener('change', state => {
    if (state !== 'active') cancel('background');
  });
  const unsubscribe = useAuthStore.subscribe(check);
  if (parent?.aborted) fromParent();
  else parent?.addEventListener('abort', fromParent, { once: true });
  check();
  return {
    signal: controller.signal, check, cancel,
    dispose() {
      appSubscription.remove(); unsubscribe();
      parent?.removeEventListener('abort', fromParent);
    },
  };
}
