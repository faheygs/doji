import { useCallback, useEffect, useRef } from 'react';
import { Platform } from 'react-native';

const presentations = new Set<() => Promise<void>>();

/** A same-route push does not blur the feed or dismiss its native inbox window. */
export async function dismissNotificationPresentations(): Promise<void> {
  let deadline: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      Promise.all([...presentations].map((dismiss) => dismiss())),
      new Promise<never>((_, reject) => {
        deadline = setTimeout(() => reject(new Error('Notification dismissal unavailable')), 5000);
      }),
    ]);
  } finally {
    clearTimeout(deadline);
  }
}

/** Return the iOS native onDismiss callback; Android completes at the hidden commit. */
export function useNotificationPresentation(visible: boolean, onClose: () => void): () => void {
  const current = useRef({ visible, onClose });
  const presented = useRef(visible);
  const closing = useRef<{ promise: Promise<void>; resolve: () => void } | null>(null);
  const finish = useCallback(() => {
    presented.current = current.current.visible;
    closing.current?.resolve();
    closing.current = null;
  }, []);
  useEffect(() => {
    current.current = { visible, onClose };
    if (visible) presented.current = true;
    if (!visible && Platform.OS !== 'ios') finish();
  }, [finish, onClose, visible]);
  useEffect(() => {
    const dismiss = () => {
      if (closing.current) return closing.current.promise;
      if (!presented.current) return Promise.resolve();
      let resolve!: () => void;
      const promise = new Promise<void>((done) => {
        resolve = done;
      });
      closing.current = { promise, resolve };
      try {
        if (current.current.visible) current.current.onClose();
      } catch (error) {
        closing.current = null;
        throw error;
      }
      return promise;
    };
    presentations.add(dismiss);
    return () => {
      presentations.delete(dismiss);
      finish();
    };
  }, [finish]);
  return finish;
}
