import React, { useMemo, useState } from 'react';
import Toast from 'react-native-toast-message';
import { supabase } from '../../lib/supabase';
import { validatePasswordField, validatePasswordMatch } from '../../lib/formValidation';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { KeyboardSafeSheet } from '../ui/KeyboardSafeSheet';

export function ChangePasswordSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const passwordCheck = useMemo(() => validatePasswordField(password, 8), [password]);
  const matchCheck = useMemo(() => validatePasswordMatch(password, confirm), [confirm, password]);
  const close = () => { setPassword(''); setConfirm(''); onClose(); };

  const save = async () => {
    if (!passwordCheck.ok || !matchCheck.ok) return;
    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password });
    setSaving(false);
    if (error) {
      Toast.show({ type: 'error', text1: 'Could not change password', text2: error.message });
      return;
    }
    Toast.show({ type: 'success', text1: 'Password updated' });
    close();
  };

  return (
    <KeyboardSafeSheet visible={visible} onClose={close} title="Change password" subtitle="Use at least 8 characters and avoid a password you use elsewhere.">
      <Input label="New password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="password-new" textContentType="newPassword" error={password.length > 0 && !passwordCheck.ok ? passwordCheck.message : undefined} />
      <Input label="Confirm new password" value={confirm} onChangeText={setConfirm} secureTextEntry autoComplete="password-new" textContentType="newPassword" error={confirm.length > 0 && !matchCheck.ok ? matchCheck.message : undefined} />
      <Button onPress={() => void save()} loading={saving} disabled={!passwordCheck.ok || !matchCheck.ok} fullWidth>Update password</Button>
    </KeyboardSafeSheet>
  );
}
