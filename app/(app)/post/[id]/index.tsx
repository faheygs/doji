import React from 'react';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { feedPostHref } from '../../../../lib/routes';

export default function PostDetailScreen() {
  const { id, openComments, mentionCommentId } = useLocalSearchParams<{
    id: string | string[];
    openComments?: string | string[];
    mentionCommentId?: string | string[];
  }>();
  const postId = Array.isArray(id) ? id[0] : id;
  const shouldOpenComments = (Array.isArray(openComments) ? openComments[0] : openComments) === '1';
  const commentId = Array.isArray(mentionCommentId) ? mentionCommentId[0] : mentionCommentId;
  return (
    <Redirect
      href={feedPostHref(postId, {
        openComments: shouldOpenComments,
        mentionCommentId: commentId,
      })}
    />
  );
}
