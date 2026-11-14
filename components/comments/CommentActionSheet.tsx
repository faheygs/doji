import { useCallback, useMemo, useRef } from 'react';
import { Modal, Platform, Pressable, StyleSheet, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Radius, Spacing } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { Text } from '../ui/Text';

export function CommentActionSheet({
  visible,
  onClose,
  onEdit,
  onDelete,
  onReport,
}: {
  visible: boolean;
  onClose: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onReport?: () => void;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const pendingActionRef = useRef<null | (() => void)>(null);
  const finishDismiss = useCallback(() => {
    const pending = pendingActionRef.current;
    pendingActionRef.current = null;
    pending?.();
  }, []);
  const runAfterClose = useCallback(
    (action: () => void) => {
      pendingActionRef.current = action;
      onClose();
      // iOS must acknowledge dismissal before another native presentation starts.
      if (Platform.OS !== 'ios') requestAnimationFrame(finishDismiss);
    },
    [finishDismiss, onClose],
  );
  const sheetStyles = useMemo(
    () =>
      StyleSheet.create({
        backdrop: {
          flex: 1,
          justifyContent: 'flex-end',
          backgroundColor: 'rgba(0,0,0,0.25)',
        },
        sheet: {
          backgroundColor: colors.surfaceElevated,
          borderTopLeftRadius: Radius.xl,
          borderTopRightRadius: Radius.xl,
          paddingBottom: Math.max(insets.bottom, Spacing.md),
          paddingTop: Spacing.sm,
        },
        row: {
          paddingVertical: Spacing.md,
          paddingHorizontal: Spacing.lg,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: colors.hairline,
        },
        cancel: {
          marginTop: Spacing.sm,
          paddingVertical: Spacing.md,
          alignItems: 'center',
        },
      }),
    [colors, insets.bottom],
  );
  if (!visible && !(Platform.OS === 'ios' && pendingActionRef.current)) return null;
  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
      onDismiss={Platform.OS === 'ios' ? finishDismiss : undefined}
    >
      <Pressable style={sheetStyles.backdrop} onPress={onClose}>
        <Pressable style={sheetStyles.sheet} onPress={(e) => e.stopPropagation()}>
          {onEdit ? (
            <TouchableOpacity
              style={sheetStyles.row}
              onPress={() => runAfterClose(onEdit)}
              accessibilityRole="button"
              accessibilityLabel="Edit comment"
            >
              <Text variant="body" style={{ fontWeight: '600' }}>
                Edit comment
              </Text>
            </TouchableOpacity>
          ) : null}
          {onDelete ? (
            <TouchableOpacity
              style={sheetStyles.row}
              onPress={() => runAfterClose(onDelete)}
              accessibilityRole="button"
              accessibilityLabel="Delete comment"
            >
              <Text variant="body" color={colors.error} style={{ fontWeight: '600' }}>
                Delete comment
              </Text>
            </TouchableOpacity>
          ) : null}
          {onReport ? (
            <TouchableOpacity
              style={sheetStyles.row}
              onPress={() => runAfterClose(onReport)}
              accessibilityRole="button"
              accessibilityLabel="Report comment"
            >
              <Text variant="body" color={colors.error} style={{ fontWeight: '600' }}>
                Report comment
              </Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity style={sheetStyles.cancel} onPress={onClose} accessibilityRole="button">
            <Text variant="body" color={colors.textSecondary}>
              Cancel
            </Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
