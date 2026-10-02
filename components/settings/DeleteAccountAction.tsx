import React, { useRef, useState } from 'react';
import { View } from 'react-native';
import Toast from 'react-native-toast-message';
import { Button } from '../ui/Button';
import { InlineFeedback } from '../ui/InlineFeedback';
import { useAppDialog } from '../../contexts/DialogContext';
import { Spacing } from '../../constants/theme';
import { supabase } from '../../lib/supabase';
import { accountDeletionFailure, isAccountDeletionConfirmed } from '../../lib/accountDeletion';
import { reportOperationalFailure } from '../../lib/telemetry';
import { useAuthStore } from '../../stores/useAuthStore';

/** Shared by Settings and the suspended-account screen; standing is not a gate. */
export function DeleteAccountAction() {
  const { showDialog } = useAppDialog();
  const [deleteError, setDeleteError] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const deletionInFlight = useRef(false);

  const handleDeleteAccount = () => {
    if (deletionInFlight.current) return;
    setDeleteError('');
    showDialog({
      title: 'Delete account',
      message: 'This permanently deletes your login, profile, and app content. Moderation and audit records may be retained separately. This cannot be undone.',
      actions: [
        { label: 'Cancel', variant: 'cancel' },
        { label: 'Delete', variant: 'destructive', onPress: async () => {
          if (deletionInFlight.current) return;
          deletionInFlight.current = true;
          setIsDeleting(true);
          try {
            if (!useAuthStore.getState().session?.user?.id) throw new Error('No active session');
            const { data, error } = await supabase.functions.invoke('delete-account');
            if (error) throw error;
            if (!isAccountDeletionConfirmed(data)) throw new Error('Unconfirmed deletion response');
          } catch (error) {
            const failure = await accountDeletionFailure(error);
            const message = failure.message + (failure.reference ? ` Reference: ${failure.reference}` : '');
            setDeleteError(message);
            showDialog({ title: 'Account deletion needs attention', message, actions: [{ label: 'OK' }] });
            reportOperationalFailure('account', 'delete_account_failed', new Error('Account deletion was not confirmed'),
              { statusCode: failure.status, requestId: failure.reference });
            deletionInFlight.current = false;
            setIsDeleting(false);
            return;
          }
          // Deletion already committed. Local cleanup cannot relabel it a failure.
          try { await useAuthStore.getState().signOut(); }
          catch {
            useAuthStore.getState().setSession(null);
            useAuthStore.getState().setLoading(false);
            reportOperationalFailure('account', 'deleted_account_local_cleanup_failed', new Error('Local session cleanup failed after account deletion'));
          }
          Toast.show({ type: 'success', text1: 'Account deleted' });
        } },
      ],
    });
  };

  return <View style={{ gap: Spacing.sm }}>
    {deleteError ? <InlineFeedback title="Account deletion needs attention" message={deleteError} /> : null}
    <Button variant="danger" onPress={handleDeleteAccount} disabled={isDeleting} loading={isDeleting}>
      {isDeleting ? 'Deleting account…' : 'Delete account'}
    </Button>
  </View>;
}
