import React, { useMemo } from 'react';
import { View, StyleSheet, SafeAreaView, ScrollView, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Spacing } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { Text } from '../../components/ui/Text';
import { IconChevronLeft } from '../../components/icons/Icons';

const SECTIONS = [
  {
    title: '1. Acceptance of Terms',
    body: 'By creating an account or using Doji, you agree to these Terms of Use and our Privacy Policy. If you do not agree, do not use the app.',
  },
  {
    title: '2. User-Generated Content',
    body: 'You are responsible for all content you post. You agree not to post content that is illegal, hateful, obscene, harassing, threatening, or otherwise objectionable. We reserve the right to remove any content that violates these terms without notice.',
  },
  {
    title: '3. Content Moderation',
    body: 'Doji reviews flagged content and acts on all reports within 24 hours. Users who violate these terms may have their content removed and accounts suspended or permanently terminated.',
  },
  {
    title: '4. Prohibited Conduct',
    body: 'You may not: (a) post abusive, threatening, or harassing content; (b) impersonate any person or entity; (c) post spam or unsolicited commercial messages; (d) share explicit, graphic, or sexually explicit content; (e) violate any applicable law or regulation; (f) attempt to interfere with the integrity of the app or its users.',
  },
  {
    title: '5. Flagging & Reporting',
    body: 'You may report any post that violates these Terms using the flag button on the post. All reports are reviewed by our moderation team within 24 hours. False or malicious reports may result in account action.',
  },
  {
    title: '6. Blocking Users',
    body: 'You may block any user at any time from their profile. Blocked users will be immediately removed from your feed and will no longer be able to interact with your content. Blocking a user notifies our team so we can review for potential abuse.',
  },
  {
    title: '7. Account Termination',
    body: 'We may suspend or terminate your account at any time, without notice, if you violate these Terms. You may delete your account at any time from your profile settings.',
  },
  {
    title: '8. Disclaimer of Warranties',
    body: 'Doji is provided "as is" without warranties of any kind. We do not guarantee that the app will be uninterrupted, error-free, or free from harmful content posted by other users.',
  },
  {
    title: '9. Privacy',
    body: 'Your use of Doji is also governed by our Privacy Policy. By using the app, you consent to the collection and use of your information as described in that policy.',
  },
  {
    title: '10. Changes to Terms',
    body: 'We may update these Terms at any time. We will notify you of significant changes. Continued use of Doji after changes are posted constitutes acceptance of the updated Terms.',
  },
  {
    title: '11. Contact',
    body: 'Questions or concerns about these Terms? Contact us at faheygs@gmail.com.',
  },
];

export default function TermsScreen() {
  const router = useRouter();
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
        <TouchableOpacity onPress={() => router.back()} hitSlop={16} accessibilityRole="button" accessibilityLabel="Back">
          <IconChevronLeft size={24} color={colors.textSecondary} />
        </TouchableOpacity>
        <Text variant="headingLarge">Terms of Use</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text variant="bodySmall" color={colors.textTertiary} style={{ marginTop: Spacing.md }}>
          Last updated: June 2026
        </Text>

        {SECTIONS.map((s) => (
          <View key={s.title} style={styles.section}>
            <Text variant="headingMedium">{s.title}</Text>
            <Text variant="body" color={colors.textSecondary} style={styles.paragraph}>
              {s.body}
            </Text>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}
