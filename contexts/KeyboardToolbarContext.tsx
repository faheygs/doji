import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

type KeyboardToolbarContextValue = {
  overlayOwnerCount: number;
  registerOverlayOwner: () => () => void;
};

const KeyboardToolbarContext = createContext<KeyboardToolbarContextValue | null>(null);

export function KeyboardToolbarProvider({ children }: { children: React.ReactNode }) {
  const [overlayOwnerCount, setOverlayOwnerCount] = useState(0);

  const registerOverlayOwner = useCallback(() => {
    setOverlayOwnerCount((count) => count + 1);
    let released = false;

    return () => {
      if (released) return;
      released = true;
      setOverlayOwnerCount((count) => Math.max(0, count - 1));
    };
  }, []);

  const value = useMemo(
    () => ({ overlayOwnerCount, registerOverlayOwner }),
    [overlayOwnerCount, registerOverlayOwner],
  );

  return (
    <KeyboardToolbarContext.Provider value={value}>
      {children}
    </KeyboardToolbarContext.Provider>
  );
}

export function useKeyboardToolbarHost() {
  const value = useContext(KeyboardToolbarContext);
  if (!value) throw new Error('useKeyboardToolbarHost must be used inside KeyboardToolbarProvider');
  return value;
}
