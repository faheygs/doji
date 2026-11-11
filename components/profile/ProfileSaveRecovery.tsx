import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { captureProfileAccount, useAuthStore } from '../../stores/useAuthStore';
import { InlineFeedback } from '../ui/InlineFeedback';
import { Button } from '../ui/Button';
import { Spacing } from '../../constants/theme';

/** The retry reuses the retained patch/key, including any already-uploaded avatar. */
export function ProfileSaveRecovery({ onSaved }: { onSaved?: () => void }) {
  const state = useAuthStore((s) => s.profileSaveState);
  const retry = useAuthStore((s) => s.retryProfileUpdate);
  const userId = useAuthStore((s) => s.session?.user?.id);
  const [failure, setFailure] = useState('');
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { setFailure(''); }, [userId]);
  useEffect(() => { if (state === 'saving') setFailure(''); }, [state]);
  const retrySave = async () => {
    const account = captureProfileAccount();
    setFailure('');
    try {
      await retry();
      if (mounted.current && account.isCurrent()) onSaved?.();
    } catch {
      if (mounted.current && account.isCurrent()) setFailure('The previous save was not confirmed. Check your connection and profile fields.');
    }
  };
  // Routine settings persist silently; explicit Save controls own their progress UI.
  if (!state || state === 'saving' || (state === 'idle' && !failure)) return null;
  return (
    <View style={{ gap: Spacing.sm }}>
      <InlineFeedback
        tone="error"
        message={failure || 'Doji could not confirm your last profile change. Retry the same save before making another change.'}
      />
      {state === 'uncertain' ? (
        <Button onPress={() => { void retrySave(); }}>
          Retry previous save
        </Button>
      ) : null}
    </View>
  );
}
