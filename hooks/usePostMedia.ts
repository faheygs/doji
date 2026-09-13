import { useEffect, useState } from 'react';
import type { Post } from '../types/database';
import { hasPrivatePostMedia, signPostMedia } from '../lib/postMedia';

type ResolvedPostMedia = Pick<Post, 'photo_url' | 'front_photo_url' | 'video_url'>;

function mediaOf(post: Post): ResolvedPostMedia {
  return {
    photo_url: post.photo_url,
    front_photo_url: post.front_photo_url,
    video_url: post.video_url,
  };
}

/** Resolve private media only for a visible, unlocked card. */
export function usePostMedia(post: Post, enabled: boolean): ResolvedPostMedia {
  const [media, setMedia] = useState<ResolvedPostMedia>(() => mediaOf(post));
  const postId = post.id;
  const photoUrl = post.photo_url;
  const frontPhotoUrl = post.front_photo_url;
  const videoUrl = post.video_url;

  useEffect(() => {
    let active = true;
    const mediaPost = {
      id: postId,
      photo_url: photoUrl,
      front_photo_url: frontPhotoUrl,
      video_url: videoUrl,
    } as Post;
    if (!enabled || !hasPrivatePostMedia(mediaPost)) {
      setMedia(mediaOf(mediaPost));
      return () => { active = false; };
    }
    // Preserve the card dimensions but do not hand authenticated object URLs
    // directly to the image component while their bearer URLs are resolving.
    setMedia({ photo_url: null, front_photo_url: null, video_url: null });
    void signPostMedia([mediaPost]).then(([resolved]) => {
      if (active && resolved) setMedia(mediaOf(resolved));
    });
    return () => { active = false; };
  }, [enabled, postId, photoUrl, frontPhotoUrl, videoUrl]);

  return media;
}
