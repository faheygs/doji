import { useCallback, useEffect, useRef } from 'react';
import { useFocusEffect } from 'expo-router';

/** Prevent a modal/sheet owned by an inactive route from intercepting touches. */
export function useDismissOnRouteBlur(visible: boolean, onClose: () => void): void {
  const visibleRef = useRef(visible);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    visibleRef.current = visible;
    onCloseRef.current = onClose;
  }, [onClose, visible]);

  useFocusEffect(
    useCallback(() => {
      return () => {
        if (visibleRef.current) onCloseRef.current();
      };
    }, []),
  );
}
