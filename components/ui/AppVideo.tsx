import React from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { useVideoPlayer, VideoView, type VideoContentFit } from 'expo-video';

type AppVideoProps = {
  uri: string;
  style?: StyleProp<ViewStyle>;
  contentFit?: VideoContentFit;
  nativeControls?: boolean;
  cache?: boolean;
};

/** A shared, paused-by-default video surface with lifecycle-owned native playback. */
export function AppVideo({
  uri,
  style,
  contentFit = 'contain',
  nativeControls = true,
  cache = false,
}: AppVideoProps) {
  const player = useVideoPlayer(cache ? { uri, useCaching: true } : uri, (instance) => {
    instance.loop = false;
    instance.pause();
  });

  return (
    <VideoView
      player={player}
      style={style}
      contentFit={contentFit}
      nativeControls={nativeControls}
      accessibilityLabel="Video"
    />
  );
}
