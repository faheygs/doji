import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import Toast from 'react-native-toast-message';
import { Spacing, Radius } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { Text } from '../../components/ui/Text';
import { IconClose } from '../../components/icons/Icons';
import { PostCard } from '../../components/feed/PostCard';
import { DemoChallengeCard } from '../../components/demo/DemoChallengeCard';
import { useDemoSetup } from '../../hooks/useDemoSetup';
import type { ChallengeType, Post } from '../../types/database';

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
  const [demoPosts, setDemoPosts] = useState<Post[]>([]);
  const [feedLoading, setFeedLoading] = useState(true);
  const { setupAndActivate, initDemoFeed } = useDemoSetup();

  useEffect(() => {
    let mounted = true;
    void (async () => {
      const posts = await initDemoFeed();
      if (mounted) {
        setDemoPosts(posts);
        setFeedLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [initDemoFeed]);

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

        {feedLoading ? (
          <ActivityIndicator
            size="small"
            color={colors.primary}
            style={styles.feedLoader}
          />
        ) : demoPosts.length === 0 ? (
          <View style={styles.emptyFeed}>
            <Text variant="bodySmall" color={colors.textSecondary}>
              Tap &quot;Try it&quot; below to post your first demo entry.
            </Text>
          </View>
        ) : (
          demoPosts.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              blurred={false}
              feedAudience="everyone"
            />
          ))
        )}

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
  feedLoader: {
    marginVertical: Spacing.xl,
  },
  emptyFeed: {
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.lg,
    padding: Spacing.md,
  },
  bottomPad: {
    height: Spacing.xxl,
  },
});
