import { QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { ThemeProvider } from '../contexts/ThemeContext';
import { DialogProvider } from '../contexts/DialogContext';
import { queryClient } from '../lib/queryClient';
import { ErrorBoundary } from './ErrorBoundary';
import { QueryCachePersistence } from './QueryCachePersistence';
import { QueryLifecycle } from './QueryLifecycle';
import { NotificationCenterProvider } from '../contexts/NotificationCenterContext';
import { KeyboardToolbarProvider } from '../contexts/KeyboardToolbarContext';

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <QueryCachePersistence>
        <ThemeProvider>
          <DialogProvider>
            <ErrorBoundary>
              <KeyboardProvider>
                <KeyboardToolbarProvider>
                  <NotificationCenterProvider>
                    <QueryLifecycle />
                    {children}
                  </NotificationCenterProvider>
                </KeyboardToolbarProvider>
              </KeyboardProvider>
            </ErrorBoundary>
          </DialogProvider>
        </ThemeProvider>
      </QueryCachePersistence>
    </QueryClientProvider>
  );
}
