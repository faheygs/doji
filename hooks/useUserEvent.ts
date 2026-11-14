import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/useAuthStore';
import type { UserEvent } from '../types/database';
import { uploadPostMedia, uploadPostVideo } from '../utils/upload';
import type { PreparedPostImage } from '../utils/upload';
import { filterContent } from '../lib/contentFilter';
import { syncServerClock } from '../lib/serverClock';
import { occurrenceCommandId, runSingleFlight } from '../lib/idempotency';
import { scheduleQueryInvalidation } from '../lib/queryInvalidationBatcher';
import { runMemberRead } from '../lib/runMemberRead';
import { getCommittedPostReceipt } from '../lib/dojiWriteReceipt';
import { executeCommand } from '../lib/commandGateway';
import { atSubmissionStage } from '../lib/dojiSubmissionError';
import { beginSubmissionJourney, submissionStep } from '../lib/submissionJourney';

export function useUserEvent() {
  const session = useAuthStore((s) => s.session);
  const userId = session?.user?.id;

  return useQuery({
    queryKey: ['userEvent', 'today', userId] as const,
    queryFn: async ({ signal }): Promise<UserEvent | null> => {
      if (!userId) return null;
      const { data: authoritativeState } = await runMemberRead(
        supabase.rpc('get_current_doji_state'), signal, 6_000,
      );
      if (!authoritativeState) return null;
      syncServerClock(authoritativeState.server_now);
      return authoritativeState.user_event;
    },
    enabled: !!userId,
    staleTime: 1000 * 30,
  });
}

type CreatePostPayload = {
  userEventId: string;
  photoUri: string | PreparedPostImage | null;
  frontPhotoUri: string | PreparedPostImage | null;
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
    mutationKey: ['createPost'],
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

        const journey = beginSubmissionJourney(userId, payload.userEventId);
        submissionStep(journey, 'upload', 'started');
        const [photoUrl, frontPhotoUrl, videoUrl] = await atSubmissionStage('upload', () => Promise.all([
          payload.photoUri
            ? uploadPostMedia(payload.userEventId, commandId, payload.photoUri, 'photo')
            : Promise.resolve(null),
          payload.frontPhotoUri
            ? uploadPostMedia(payload.userEventId, commandId, payload.frontPhotoUri, 'front')
            : Promise.resolve(null),
          payload.videoUri
            ? uploadPostVideo(payload.userEventId, commandId, payload.videoUri)
            : Promise.resolve(null),
        ])).catch(error => { submissionStep(journey, 'upload', 'failed', error); throw error; });
        submissionStep(journey, 'upload', 'confirmed');
        submissionStep(journey, 'submit', 'started');

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
          submissionStep(journey, 'submit', 'failed', postError);
          submissionStep(journey, 'receipt', 'started');
          const committedPost = await getCommittedPostReceipt(payload.userEventId).catch(() => null);
          if (committedPost) { submissionStep(journey, 'receipt', 'confirmed'); return committedPost; }
          submissionStep(journey, 'receipt', 'failed');
          throw postError;
        }
        submissionStep(journey, 'submit', 'confirmed');
        return post;
      });
    },
    onSuccess: (_post, payload) => {
      const userId = session?.user?.id;
      if (!userId || useAuthStore.getState().session?.user.id !== userId) return;
      const key = ['userEvent', 'today', userId] as const;
      const prev = queryClient.getQueryData<UserEvent | null>(key);
      if (prev && prev.id !== payload.userEventId) return;
      // Unlock only after the command or its receipt confirms the post. Reads
      // begun before commit can otherwise cache an empty unlocked feed.
      const reads = {
        predicate: (query: { queryKey: readonly unknown[] }) =>
          query.queryKey[0] === 'feed' && query.queryKey[3] === userId &&
          !!prev?.daily_event_id && query.queryKey[1] === prev.daily_event_id,
      };
      void queryClient.cancelQueries(reads);
      void queryClient.invalidateQueries({ ...reads, refetchType: 'none' });
      void queryClient.cancelQueries({ queryKey: key }, { revert: false, silent: true });
      if (prev) {
        queryClient.setQueryData<UserEvent>(key, {
          ...prev,
          status: prev.status === 'buy_in_open' ? 'late' : 'completed',
          completed_at: new Date().toISOString(),
        });
      }
      // Replace pre-commit reads immediately without delaying return-to-feed.
      void queryClient.refetchQueries({ ...reads, type: 'active' });
      void queryClient.refetchQueries({ queryKey: key });
      scheduleQueryInvalidation(queryClient, ['profile', 'leaderboard']);
      void fetchProfile(userId);
    },
  });
}
