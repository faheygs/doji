import { useEffect, useMemo, useRef, useState } from 'react';
import { TouchableOpacity, View } from 'react-native';
import { Image } from 'expo-image';
import type { Post } from '../../types/database';
import type { usePostMedia } from '../../hooks/usePostMedia';
import { postMediaCacheKey } from '../../lib/postMedia';
import type { usePostCardStyles } from './usePostCardStyles';
import { PostMediaFeedback } from './PostMediaFeedback';
import { Skeleton } from '../ui/Skeleton';

type Props = {
  post: Post;
  media: ReturnType<typeof usePostMedia>;
  thumbnail: ReturnType<typeof usePostMedia>;
  showFront: boolean;
  active: boolean;
  onToggle: () => void;
  styles: ReturnType<typeof usePostCardStyles>;
};

/** Native decode/display is independently bounded after authorized signing completes. */
export function PostMediaFrame({
  post,
  media,
  thumbnail,
  showFront,
  active,
  onToggle,
  styles,
}: Props) {
  const [attempt, setAttempt] = useState(0);
  const [readyFor, setReadyFor] = useState<string | null>(null);
  const [failure, setFailure] = useState<{ identity: string; message: string } | null>(null);
  const frontSelected = Boolean(showFront && media.front_photo_url);
  const reference = frontSelected ? post.front_photo_url : post.photo_url;
  const uri = frontSelected ? media.front_photo_url : media.photo_url;
  const identity = JSON.stringify([post.id, reference, attempt]);
  const latest = useRef(identity);
  latest.current = identity;
  const ready = readyFor === identity;
  const error = failure?.identity === identity ? failure.message : null;
  const previousRecovery = useRef(media.recoveryVersion);
  useEffect(() => {
    if (previousRecovery.current !== media.recoveryVersion && error)
      setAttempt((value) => value + 1);
    previousRecovery.current = media.recoveryVersion;
  }, [media.recoveryVersion, error]);
  const hasVideo = Boolean(media.video_url);
  const source = useMemo(
    () => ({ uri: uri ?? '', cacheKey: postMediaCacheKey(reference, 'feed') }),
    [uri, reference],
  );
  const thumbUri = frontSelected ? thumbnail.photo_url : thumbnail.front_photo_url;
  const thumbRef = frontSelected ? post.photo_url : post.front_photo_url;
  const thumbSource = useMemo(
    () => ({ uri: thumbUri ?? '', cacheKey: postMediaCacheKey(thumbRef, 'thumbnail') }),
    [thumbUri, thumbRef],
  );
  const fail = (message: string) => {
    if (latest.current === identity) setFailure({ identity, message });
  };
  useEffect(() => {
    latest.current = identity;
    return () => {
      if (latest.current === identity) latest.current = '';
    };
  }, [identity]);
  useEffect(() => {
    if (!uri || ready || error || !active) return;
    const timer = setTimeout(() => {
      if (latest.current === identity)
        setFailure({ identity, message: 'Media is taking longer than expected.' });
    }, 15_000);
    return () => clearTimeout(timer);
  }, [uri, ready, error, active, identity]);
  const retry = () => {
    setAttempt((value) => value + 1);
    media.retry();
    thumbnail.retry();
  };
  return (
    <View style={styles.mediaFrame}>
      <TouchableOpacity
        onPress={onToggle}
        activeOpacity={media.front_photo_url && !hasVideo ? 0.95 : 1}
        disabled={!media.front_photo_url || hasVideo}
        style={styles.media}
      >
        <Image
          key={identity}
          source={source}
          style={[styles.media, !ready && styles.mediaHidden]}
          contentFit="cover"
          cachePolicy="memory-disk"
          recyclingKey={`${post.id}-main-${frontSelected ? 'front' : 'back'}`}
          onDisplay={() => {
            if (latest.current === identity) {
              setReadyFor(identity);
              setFailure(null);
            }
          }}
          onError={() => {
            if (latest.current === identity) setReadyFor(null);
            fail('Media could not be loaded.');
          }}
        />
        {!ready && !error ? (
          <Skeleton height="100%" radius={0} style={styles.mediaSkeleton} />
        ) : null}
        {media.front_photo_url && !hasVideo ? (
          <View style={styles.frontThumbnailContainer}>
            <Image
              source={thumbSource}
              style={styles.frontThumbnail}
              contentFit="cover"
              cachePolicy="memory-disk"
              recyclingKey={`${post.id}-thumb-${frontSelected ? 'back' : 'front'}`}
            />
          </View>
        ) : null}
      </TouchableOpacity>
      {!ready && error ? (
        <View style={styles.mediaSkeleton}>
          <PostMediaFeedback message={error} onRetry={retry} />
        </View>
      ) : null}
    </View>
  );
}
