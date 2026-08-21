import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Text } from '@/components/ui/Text';
import { useTheme } from '@/contexts/ThemeContext';

type Props = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  document: 'terms' | 'privacy';
};

export function LegalConsentCheckbox({ checked, onChange, document }: Props) {
  const router = useRouter();
  const { colors } = useTheme();
  const isTerms = document === 'terms';
  const label = isTerms ? 'Terms of Use' : 'Privacy Policy';
  const href = isTerms ? '/(auth)/terms' : '/(auth)/privacy';

  return (
    <View style={styles.row}>
      <TouchableOpacity
        onPress={() => onChange(!checked)}
        style={styles.checkboxHit}
        activeOpacity={0.7}
        accessibilityRole="checkbox"
        accessibilityLabel={`Agree to the ${label}`}
        accessibilityState={{ checked }}
      >
        <View
          style={[
            styles.checkbox,
            {
              borderColor: checked ? colors.primary : colors.border,
              backgroundColor: checked ? colors.primary : 'transparent',
            },
          ]}
        >
          {checked ? (
            <Text variant="micro" color={colors.onPrimary} style={styles.checkmark}>✓</Text>
          ) : null}
        </View>
      </TouchableOpacity>
      <Text variant="bodySmall" color={colors.textSecondary} style={styles.label}>
        {isTerms ? 'I agree to the ' : 'I have read and agree to the '}
        <Text variant="bodySmall" color={colors.link} onPress={() => router.push(href)}>
          {label}
        </Text>
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  checkboxHit: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: -11,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { flex: 1 },
  checkmark: { fontWeight: '700' },
});
