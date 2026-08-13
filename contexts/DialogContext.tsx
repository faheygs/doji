import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { Keyboard } from 'react-native';
import { usePathname } from 'expo-router';
import {
  AppDialog,
  type AppDialogAction,
  type AppDialogOptions,
} from '../components/ui/AppDialog';

type DialogApi = {
  showDialog: (options: AppDialogOptions) => void;
  dismissDialog: () => void;
};

const DialogContext = createContext<DialogApi | null>(null);

export function DialogProvider({ children }: { children: React.ReactNode }) {
  const [dialog, setDialog] = useState<AppDialogOptions | null>(null);
  const pathname = usePathname();

  React.useEffect(() => setDialog(null), [pathname]);

  const dismissDialog = useCallback(() => setDialog(null), []);
  const showDialog = useCallback((options: AppDialogOptions) => {
    Keyboard.dismiss();
    setDialog(options);
  }, []);

  const actions = useMemo<AppDialogAction[]>(
    () =>
      dialog?.actions.map((action) => ({
        ...action,
        onPress: () => {
          setDialog(null);
          return action.onPress?.();
        },
      })) ?? [],
    [dialog],
  );

  const api = useMemo(() => ({ showDialog, dismissDialog }), [showDialog, dismissDialog]);

  return (
    <DialogContext.Provider value={api}>
      {children}
      <AppDialog
        visible={dialog != null}
        title={dialog?.title ?? ''}
        message={dialog?.message}
        actions={actions}
        layout={dialog?.layout}
        dismissible={dialog?.dismissible}
        onDismiss={dismissDialog}
      />
    </DialogContext.Provider>
  );
}

export function useAppDialog(): DialogApi {
  const context = useContext(DialogContext);
  if (!context) throw new Error('useAppDialog must be used inside DialogProvider');
  return context;
}
