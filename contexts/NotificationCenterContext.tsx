import React, { createContext, useContext } from 'react';
import { useNotificationCenter } from '../hooks/useNotificationCenter';

type NotificationCenterValue = ReturnType<typeof useNotificationCenter>;
const NotificationCenterContext = createContext<NotificationCenterValue | null>(null);

export function NotificationCenterProvider({ children }: { children: React.ReactNode }) {
  const value = useNotificationCenter();
  return (
    <NotificationCenterContext.Provider value={value}>
      {children}
    </NotificationCenterContext.Provider>
  );
}

export function useNotificationCenterContext() {
  const value = useContext(NotificationCenterContext);
  if (!value) throw new Error('NotificationCenterProvider is missing');
  return value;
}
