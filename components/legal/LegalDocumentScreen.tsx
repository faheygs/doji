import React, { useMemo } from 'react';
import { SafeAreaView, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';
import { Text } from '@/components/ui/Text';
import { IconChevronLeft } from '@/components/icons/Icons';
import { LEGAL_EFFECTIVE_DATE, type LegalSection } from '@/lib/legalDocuments';
import { goBackToExplicitReturn } from '@/lib/navigationReturn';

type Props = {
  title: string;
  sections: LegalSection[];
};

export function LegalDocumentScreen({ title, sections }: Props) {
  const router = useRouter();
  const { returnTo } = useLocalSearchParams<{ returnTo?: string }>();
  const { colors } = useTheme();
  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: { flex: 1, backgroundColor: colors.background },
        header: {
          paddingHorizontal: Spacing.lg,
          paddingTop: Spacing.md,
          paddingBottom: Spacing.sm,
          flexDirection: 'row',
          alignItems: 'center',
          gap: Spacing.md,
        },
        scroll: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.xxl },
        section: { marginTop: Spacing.xl, gap: Spacing.sm },
        paragraph: { lineHeight: 22 },
      }),
    [colors.background],
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => goBackToExplicitReturn(router, returnTo, '/(app)/profile/settings' as Href)}
          hitSlop={16}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <IconChevronLeft size={24} color={colors.textSecondary} />
        </TouchableOpacity>
        <Text variant="headingLarge">{title}</Text>
      </View>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text variant="bodySmall" color={colors.textTertiary} style={{ marginTop: Spacing.md }}>
          Effective {LEGAL_EFFECTIVE_DATE}
        </Text>
        {sections.map((section) => (
          <View key={section.title} style={styles.section}>
            <Text variant="headingMedium">{section.title}</Text>
            <Text variant="body" color={colors.textSecondary} style={styles.paragraph}>
              {section.body}
            </Text>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}
