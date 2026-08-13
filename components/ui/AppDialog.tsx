import React from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { Radius, Spacing } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { Button } from './Button';
import { Text } from './Text';

export type AppDialogAction = {
  label: string;
  variant?: 'default' | 'cancel' | 'destructive';
  onPress?: () => void | Promise<void>;
};

export type AppDialogOptions = {
  title: string;
  message?: string;
  actions: AppDialogAction[];
  layout?: 'row' | 'stacked';
  dismissible?: boolean;
};

type Props = AppDialogOptions & {
  visible: boolean;
  onDismiss: () => void;
};

export function AppDialog({
  visible,
  title,
  message,
  actions,
  layout = 'row',
  dismissible = true,
  onDismiss,
}: Props) {
  const { colors } = useTheme();
  const stacked = layout === 'stacked' || actions.length > 2;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={dismissible ? onDismiss : undefined}
    >
      <View style={styles.overlay}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close dialog"
          disabled={!dismissible}
          onPress={onDismiss}
          style={[StyleSheet.absoluteFill, { backgroundColor: colors.overlayBackdrop }]}
        />
        <View
          accessibilityRole="alert"
          style={[styles.card, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}
        >
          <View style={styles.copy}>
            <Text variant="headingLarge">{title}</Text>
            {message ? (
              <Text variant="body" color={colors.textSecondary}>
                {message}
              </Text>
            ) : null}
          </View>
          <View style={[styles.actions, stacked ? styles.stacked : styles.row]}>
            {actions.map((action) => (
              <Button
                key={action.label}
                onPress={() => void action.onPress?.()}
                variant={
                  action.variant === 'destructive'
                    ? 'danger'
                    : action.variant === 'cancel'
                      ? 'secondary'
                      : 'primary'
                }
                size="md"
                style={stacked ? styles.fullWidth : styles.flexAction}
              >
                {action.label}
              </Button>
            ))}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.lg,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.lg,
    gap: Spacing.lg,
    shadowColor: '#000',
    shadowOpacity: 0.28,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 12,
  },
  copy: { gap: Spacing.sm },
  actions: { gap: Spacing.sm },
  row: { flexDirection: 'row' },
  stacked: { flexDirection: 'column' },
  flexAction: { flex: 1 },
  fullWidth: { width: '100%' },
});
