import React, { useState, useCallback } from 'react';
import {
  View,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import Toast from 'react-native-toast-message';
import { Spacing, Radius } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { Text } from '../../components/ui/Text';
import { IconClose } from '../../components/icons/Icons';
import { DemoPostCard, type DemoPost } from '../../components/demo/DemoPostCard';
import { DemoChallengeCard } from '../../components/demo/DemoChallengeCard';
import { useDemoSetup } from '../../hooks/useDemoSetup';
import type { ChallengeType } from '../../types/database';

const DEMO_POSTS: DemoPost[] = [
  {
    id: 'demo-1',
    type: 'photo',
    challengeTitle: 'Show Us Your World',
    username: 'jordan_k',
    displayName: 'Jordan K.',
    gradientColors: ['#FF6B35', '#F7C59F'],
    photoUrl: 'https://picsum.photos/seed/doji1/600/600',
    caption: 'My morning setup — finally got the lighting right 📸',
    reactionCounts: { fire: 14, heart: 9, wow: 3 },
    comments: [
      { username: 'alex_m', text: 'The lighting is everything 🔥' },
      { username: 'sam_r', text: 'Okay this is way too aesthetic for 8am' },
    ],
  },
  {
    id: 'demo-2',
    type: 'poll',
    challengeTitle: 'Coffee or Tea?',
    username: 'alex_m',
    displayName: 'Alex M.',
    gradientColors: ['#4776E6', '#8E54E9'],
    photoUrl: null,
    caption: null,
    pollOptions: [
      { text: 'Coffee ☕', percent: 47 },
      { text: 'Tea 🍵', percent: 28 },
      { text: 'Neither', percent: 8 },
      { text: 'Both!', percent: 17 },
    ],
    selectedOption: 1,
    reactionCounts: { fire: 22, like: 8 },
    comments: [
      { username: 'mia_t', text: 'Tea gang rise up 🍵' },
      { username: 'jordan_k', text: "Coffee people won and it isn't close" },
    ],
  },
  {
    id: 'demo-3',
    type: 'task',
    challengeTitle: 'Describe Your Day',
    username: 'sam_r',
    displayName: 'Sam R.',
    gradientColors: ['#11998e', '#38ef7d'],
    photoUrl: null,
    caption: 'Productive chaos. Three meetings, one good idea, two cold coffees. Somehow still smiling.',
    reactionCounts: { heart: 11, like: 7, fire: 4 },
    comments: [
      { username: 'jordan_k', text: '"productive chaos" is such a mood' },
      { username: 'alex_m', text: 'cold coffee hits different when you forget about it' },
    ],
  },
  {
    id: 'demo-4',
    type: 'format',
    challengeTitle: 'Two Sentence Story',
    username: 'mia_t',
    displayName: 'Mia T.',
    gradientColors: ['#f953c6', '#b91d73'],
    photoUrl: null,
    caption:
      'She checked her phone one last time before bed. The notification could wait — it already had for three years.',
    reactionCounts: { fire: 18, wow: 12, heart: 6 },
    comments: [
      { username: 'sam_r', text: 'Okay this actually got me 😭' },
      { username: 'alex_m', text: 'I need a sequel immediately' },
    ],
  },
];

const CHALLENGE_CARDS = [
  {
    type: 'photo' as ChallengeType,
    emoji: '📷',
    label: 'Photo Challenge',
    desc: 'Show Us Your World',
    route: '/(app)/camera',
  },
  {
    type: 'poll' as ChallengeType,
    emoji: '📊',
    label: 'Poll Challenge',
    desc: 'Coffee or Tea?',
    route: '/(app)/poll',
  },
  {
    type: 'task' as ChallengeType,
    emoji: '📝',
    label: 'Task Challenge',
    desc: 'Describe Your Day',
    route: '/(app)/task',
  },
  {
    type: 'format' as ChallengeType,
    emoji: '✍️',
    label: 'Format Challenge',
    desc: 'Two Sentence Story',
    route: '/(app)/format',
  },
] as const;

export default function DemoScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const [loading, setLoading] = useState<ChallengeType | null>(null);
  const { setupAndActivate } = useDemoSetup();

  const handleTry = useCallback(
    async (type: ChallengeType, route: string) => {
      setLoading(type);
      try {
        const event = await setupAndActivate(type);
        if (!event) {
          Toast.show({ type: 'error', text1: 'Could not start demo. Try again.' });
          return;
        }
        router.push(route as any);
      } finally {
        setLoading(null);
      }
    },
    [setupAndActivate, router],
  );

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.headerBar, { borderBottomColor: colors.hairline }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={16} style={styles.headerClose}>
          <IconClose size={24} color={colors.textSecondary} />
        </TouchableOpacity>
        <Text variant="headingMedium" color={colors.text}>
          Demo Mode
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Info banner */}
        <View style={[styles.infoBanner, { backgroundColor: `${colors.primary}14`, borderColor: `${colors.primary}40` }]}>
          <Text variant="bodySmall" color={colors.text} style={styles.infoText}>
            This is a live demo. Sample posts below show how the feed looks. Tap &quot;Try it&quot; to go
            through the real posting flow for each challenge type.
          </Text>
        </View>

        {/* Section A — Demo Feed */}
        <View style={styles.sectionHeader}>
          <Text variant="headingMedium" color={colors.text}>
            The Social Feed
          </Text>
          <Text variant="bodySmall" color={colors.textSecondary} style={styles.sectionSub}>
            This is what the feed looks like after friends complete their challenge.
          </Text>
        </View>

        {DEMO_POSTS.map((post) => (
          <DemoPostCard key={post.id} post={post} />
        ))}

        {/* Section B — Try It Yourself */}
        <View style={styles.sectionHeader}>
          <Text variant="headingMedium" color={colors.text}>
            Try Each Challenge
          </Text>
          <Text variant="bodySmall" color={colors.textSecondary} style={styles.sectionSub}>
            Go through the full posting flow for any challenge type.
          </Text>
        </View>

        {CHALLENGE_CARDS.map((card) => (
          <DemoChallengeCard
            key={card.type}
            emoji={card.emoji}
            label={card.label}
            desc={card.desc}
            isLoading={loading === card.type}
            onPress={() => void handleTry(card.type, card.route)}
          />
        ))}

        <View style={styles.bottomPad} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerClose: {
    width: 40,
    height: 40,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  headerSpacer: {
    width: 40,
  },
  scrollContent: {
    paddingTop: Spacing.md,
  },
  infoBanner: {
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.lg,
    borderRadius: Radius.md,
    borderWidth: 1,
    padding: Spacing.md,
  },
  infoText: {
    lineHeight: 20,
  },
  sectionHeader: {
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.md,
    gap: Spacing.xs,
  },
  sectionSub: {
    lineHeight: 20,
  },
  bottomPad: {
    height: Spacing.xxl,
  },
});
