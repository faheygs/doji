import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/useAuthStore';
import type { UserEvent } from '../types/database';
import { uploadPostMedia, uploadPostVideo } from '../utils/upload';
import { filterContent } from '../lib/contentFilter';
import { syncServerClock } from '../lib/serverClock';
import { occurrenceCommandId, runSingleFlight } from '../lib/idempotency';
import { scheduleQueryInvalidation } from '../lib/queryInvalidationBatcher';
import { createRequestSignal } from '../lib/requestSignal';
import { getCommittedPostReceipt } from '../lib/dojiWriteReceipt';
import { executeCommand } from '../lib/commandGateway';

export function useUserEvent() {
  const session = useAuthStore((s) => s.session);
  const userId = session?.user?.id;

  return useQuery({
    queryKey: ['userEvent', 'today', userId] as const,
    queryFn: async ({ signal }): Promise<UserEvent | null> => {
      if (!userId) return null;
      const request = createRequestSignal(signal, 6_000);
      try {
        const { data: authoritativeState, error: stateError } = await supabase
          .rpc('get_current_doji_state')
          .abortSignal(request.signal);
        if (stateError) throw stateError;
        if (!authoritativeState) return null;
        syncServerClock(authoritativeState.server_now);
        return authoritativeState.user_event;
      } finally {
        request.cleanup();
      }
    },
    enabled: !!userId,
    staleTime: 1000 * 30,
  });
}

type CreatePostPayload = {
  userEventId: string;
  photoUri: string | null;
  frontPhotoUri: string | null;
  videoUri: string | null;
  caption: string;
  isLate: boolean;
  postType?: 'photo' | 'poll_vote' | 'task_complete';
  commandId?: string;
};

export function useCreatePost() {
  const queryClient = useQueryClient();
  const session = useAuthStore((s) => s.session);
  const fetchProfile = useAuthStore((s) => s.fetchProfile);

  return useMutation({
    mutationFn: async (payload: CreatePostPayload) => {
      const userId = session?.user?.id;
      if (!userId) throw new Error('Not authenticated');
      const commandId =
        payload.commandId ?? occurrenceCommandId('complete-doji', payload.userEventId);

      return runSingleFlight(commandId, async () => {
        if (payload.caption) {
          const check = filterContent(payload.caption);
          if (!check.ok) throw new Error(check.reason);
        }

        const [photoUrl, frontPhotoUrl, videoUrl] = await Promise.all([
          payload.photoUri
            ? uploadPostMedia(payload.userEventId, commandId, payload.photoUri, 'photo')
            : Promise.resolve(null),
          payload.frontPhotoUri
            ? uploadPostMedia(payload.userEventId, commandId, payload.frontPhotoUri, 'front')
            : Promise.resolve(null),
          payload.videoUri
            ? uploadPostVideo(payload.userEventId, commandId, payload.videoUri)
            : Promise.resolve(null),
        ]);

        const { data: post, error: postError } = await executeCommand('complete_doji_with_post', {
          p_user_event_id: payload.userEventId,
          p_post_type: payload.postType ?? 'photo',
          p_caption: payload.caption,
          p_photo_url: photoUrl,
          p_front_photo_url: frontPhotoUrl,
          p_video_url: videoUrl,
          p_visibility: 'friends',
          p_idempotency_key: commandId,
        });

        if (postError) {
          const committedPost = await getCommittedPostReceipt(payload.userEventId);
          if (committedPost) return committedPost;
          throw postError;
        }
        return post;
      });
    },
    onMutate: () => {
      const userId = session?.user?.id;
      if (!userId) return;
      const key = ['userEvent', 'today', userId] as const;
      const prev = queryClient.getQueryData<UserEvent | null>(key);
      void queryClient.cancelQueries({ queryKey: key }, { revert: false, silent: true });
      if (prev) {
        queryClient.setQueryData<UserEvent>(key, {
          ...prev,
          status: prev.status === 'buy_in_open' ? 'late' : 'completed',
          completed_at: new Date().toISOString(),
        });
      }
      return { prev, key };
    },
    onError: (_err, _vars, ctx) => {
      if (!ctx?.prev || !ctx?.key) return;
      queryClient.setQueryData(ctx.key, ctx.prev);
    },
    onSuccess: () => {
      const uid = session?.user?.id;
      if (uid) {
        void queryClient.refetchQueries(
          { queryKey: ['userEvent', 'today', uid] },
          { cancelRefetch: false },
        );
      }
      scheduleQueryInvalidation(queryClient, ['profile', 'leaderboard', 'feed']);
      if (uid) fetchProfile(uid);
    },
  });
}
