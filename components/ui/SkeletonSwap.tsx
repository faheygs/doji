import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { FadeIn, FadeOut, ReduceMotion } from 'react-native-reanimated';
import { Motion } from '../../constants/motion';

type Props = {
  loading: boolean;
  skeleton: React.ReactNode;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  fill?: boolean;
};

const enter = FadeIn.duration(Motion.duration.content).reduceMotion(ReduceMotion.System);
const exit = FadeOut.duration(Motion.duration.fast).reduceMotion(ReduceMotion.System);

/** Crossfades a cold-load skeleton into content without covering cached data. */
export function SkeletonSwap({ loading, skeleton, children, style, fill = true }: Props) {
  return (
    <View style={[fill && styles.fill, style]}>
      {loading ? (
        <Animated.View key="skeleton" style={fill && styles.fill} exiting={exit}>
          {skeleton}
        </Animated.View>
      ) : (
        <Animated.View key="content" style={fill && styles.fill} entering={enter}>
          {children}
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, minHeight: 0 },
});
