import React, { useMemo, useState } from 'react';
import Toast from 'react-native-toast-message';
import { supabase } from '../../lib/supabase';
import { validatePasswordField, validatePasswordMatch } from '../../lib/formValidation';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { KeyboardSafeSheet } from '../ui/KeyboardSafeSheet';
import { InlineFeedback } from '../ui/InlineFeedback';

export function ChangePasswordSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const passwordCheck = useMemo(() => validatePasswordField(password, 8), [password]);
  const matchCheck = useMemo(() => validatePasswordMatch(password, confirm), [confirm, password]);
  const close = () => { setPassword(''); setConfirm(''); setSaveError(''); onClose(); };

  const save = async () => {
    if (!passwordCheck.ok || !matchCheck.ok) return;
    setSaveError('');
    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password });
    setSaving(false);
    if (error) {
      setSaveError(error.message || 'Could not change your password. Try again.');
      return;
    }
    Toast.show({ type: 'success', text1: 'Password updated' });
    close();
  };

  return (
    <KeyboardSafeSheet visible={visible} onClose={close} title="Change password" subtitle="Use at least 8 characters and avoid a password you use elsewhere.">
      <Input label="New password" value={password} onChangeText={(value) => { setPassword(value); setSaveError(''); }} secureTextEntry autoComplete="password-new" textContentType="newPassword" error={password.length > 0 && !passwordCheck.ok ? passwordCheck.message : undefined} />
      <Input label="Confirm new password" value={confirm} onChangeText={(value) => { setConfirm(value); setSaveError(''); }} secureTextEntry autoComplete="password-new" textContentType="newPassword" error={confirm.length > 0 && !matchCheck.ok ? matchCheck.message : undefined} />
      {saveError ? <InlineFeedback title="Could not change password" message={saveError} /> : null}
      <Button onPress={() => void save()} loading={saving} disabled={!passwordCheck.ok || !matchCheck.ok} fullWidth>Update password</Button>
    </KeyboardSafeSheet>
  );
}
