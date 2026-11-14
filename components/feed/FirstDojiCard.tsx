import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { Radius, Spacing } from '../../constants/theme';
import { Text } from '../ui/Text';
import { ProfileAvatar } from '../ui/ProfileAvatar';
import { IcnFirstPlace } from '../icons/FirstPlaceIcon';
import { prepareProfileHref } from '../../lib/profileNavigation';
import type { FirstDoji } from '../../lib/firstDoji';

export const FirstDojiCard = memo(function FirstDojiCard({ winner }: { winner: FirstDoji }) {
  const router = useRouter();
  const client = useQueryClient();
  const handle = `@${winner.profile.username}`;
  return (
    <Pressable
      style={styles.card}
      accessibilityRole="button"
      accessibilityLabel={`Congrats to ${handle}! First to Doji today!`}
      accessibilityHint="Open profile"
      onPress={() => {
        const href = prepareProfileHref(winner.profile.username, '/(app)/(tabs)', client);
        if (href) router.push(href);
      }}
    >
      <LinearGradient
        colors={['#512D91', '#703B87', '#A34226']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.inner}
      >
        <View style={styles.portrait}>
          <ProfileAvatar
            profile={{
              ...winner.profile,
              display_name: winner.profile.display_name ?? winner.profile.username,
            }}
            size={64}
          />
          <View style={styles.medal}>
            <IcnFirstPlace size={20} color="#482309" />
          </View>
        </View>
        <Text color="#FFFFFF" style={styles.title}>
          Congrats to {handle}!
        </Text>
        <Text color="#FFFFFF" style={styles.message}>
          First to Doji today!
        </Text>
      </LinearGradient>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  card: {
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.lg,
    borderRadius: Radius.xl,
    overflow: 'hidden',
  },
  inner: { alignItems: 'center', padding: Spacing.lg },
  portrait: {
    padding: 4,
    borderWidth: 3,
    borderColor: '#F8D47A',
    borderRadius: Radius.full,
    marginBottom: Spacing.md,
  },
  medal: {
    position: 'absolute',
    right: -5,
    bottom: -2,
    width: 30,
    height: 30,
    borderRadius: Radius.full,
    backgroundColor: '#F8D47A',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  title: { fontSize: 24, lineHeight: 32, fontWeight: '800', textAlign: 'center' },
  message: {
    fontSize: 17,
    lineHeight: 24,
    fontWeight: '500',
    textAlign: 'center',
    marginTop: Spacing.xs,
  },
});
