import type { PushPermissionResult } from './pushNotifications';

/** Build availability and registration failures are not OS permission denials. */
export function notificationSetupFeedback(result: PushPermissionResult) {
  switch (result) {
    case 'unsupported':
      return {
        tone: 'info' as const,
        message: 'Phone alerts are not available in this build. A push-enabled build is required.',
      };
    case 'deferred':
      return {
        tone: 'info' as const,
        message: 'Alert setup was interrupted. Try again to finish connecting this phone.',
      };
    case 'error':
      return {
        tone: 'error' as const,
        message: 'Could not connect this phone to alerts. Try again.',
      };
    default:
      return null;
  }
}
