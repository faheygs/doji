import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/useAuthStore';
import type {
  UserEvent,
  Challenge,
  DailyEvent,
  UserEventStatus,
} from '../types/database';
import { todayFiresAtWindow } from '../lib/challengeDay';
import { uploadPostMedia, uploadPostVideo } from '../utils/upload';

export function useUserEvent() {
  const session = useAuthStore((s) => s.session);
  const userId = session?.user?.id;

  return useQuery({
    queryKey: ['userEvent', 'today', userId],
    queryFn: async (): Promise<UserEvent | null> => {
      if (!userId) return null;

      const { start, end } = todayFiresAtWindow();

      const { data: dailyEvents, error: deErr } = await supabase
        .from('daily_events')
        .select('id')
        .gte('fires_at', start)
        .lt('fires_at', end);

      if (deErr) throw deErr;
      const dailyIds = (dailyEvents ?? []).map((e: { id: string }) => e.id);
      if (dailyIds.length === 0) return null;

      type UserEventQueryRow = UserEvent & {
        daily_event?: DailyEvent & { challenge?: Challenge };
      };

      // One row per user per daily_event — latest if duplicates
      const { data, error } = await supabase
        .from('user_events')
        .select(`*, daily_event:daily_events(*, challenge:challenges(*))`)
        .eq('user_id', userId)
        .in('daily_event_id', dailyIds)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      if (!data) {
        const { data: ensured, error: ensureErr } = await supabase.rpc('ensure_today_user_event');
        if (ensureErr) {
          if (__DEV__) console.warn('[useUserEvent] ensure_today_user_event', ensureErr.message);
          return null;
        }
        if (!ensured) return null;

        const row = ensured as UserEvent & {
          daily_event?: DailyEvent & { challenge?: Challenge };
        };
        const { data: withDaily, error: refetchErr } = await supabase
          .from('user_events')
          .select(`*, daily_event:daily_events(*, challenge:challenges(*))`)
          .eq('id', row.id)
          .maybeSingle();
        if (refetchErr) throw refetchErr;
        if (!withDaily) return null;
        const refetchRow = withDaily as UserEventQueryRow;
        const challenge = refetchRow.daily_event?.challenge;
        return { ...refetchRow, challenge } as UserEvent;
      }

      const row = data as UserEventQueryRow;
      const challenge = row.daily_event?.challenge;
      return { ...row, challenge } as UserEvent;
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
};

export function useCreatePost() {
  const queryClient = useQueryClient();
  const session = useAuthStore((s) => s.session);
  const fetchProfile = useAuthStore((s) => s.fetchProfile);

  return useMutation({
    mutationFn: async (payload: CreatePostPayload) => {
      const userId = session?.user?.id;
      if (!userId) throw new Error('Not authenticated');

      let photoUrl: string | null = null;
      let frontPhotoUrl: string | null = null;
      let videoUrl: string | null = null;

      if (payload.photoUri) {
        photoUrl = await uploadPostMedia(userId, payload.photoUri, 'photo');
      }
      if (payload.frontPhotoUri) {
        frontPhotoUrl = await uploadPostMedia(userId, payload.frontPhotoUri, 'front');
      }
      if (payload.videoUri) {
        videoUrl = await uploadPostVideo(userId, payload.videoUri);
      }

      const { data: post, error: postError } = await supabase
        .from('posts')
        .insert({
          user_event_id: payload.userEventId,
          user_id: userId,
          type: payload.postType ?? 'photo',
          caption: payload.caption || null,
          photo_url: photoUrl,
          front_photo_url: frontPhotoUrl,
          video_url: videoUrl,
          is_late: payload.isLate,
          visibility: 'friends',
        })
        .select()
        .single();

      if (postError) throw postError;

      const statusUpdate: { status: UserEventStatus; completed_at: string } = {
        status: payload.isLate ? 'late' : 'completed',
        completed_at: new Date().toISOString(),
      };

      const { error: updateError } = await supabase
        .from('user_events')
        .update(statusUpdate)
        .eq('id', payload.userEventId);

      if (updateError) {
        console.error('user_event status update failed, retrying:', updateError);
        const { error: retryError } = await supabase
          .from('user_events')
          .update(statusUpdate)
          .eq('id', payload.userEventId);
        if (retryError) {
          console.error('user_event status retry also failed:', retryError);
          throw new Error(
            'Your post was saved, but the app could not mark the challenge complete. Pull down to refresh.',
          );
        }
      }

      return post;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['userEvent', 'today'] });
      queryClient.invalidateQueries({ queryKey: ['feed'] });
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      queryClient.invalidateQueries({ queryKey: ['leaderboard'] });
      queryClient.invalidateQueries({ queryKey: ['profilePosts'] });
      const uid = session?.user?.id;
      if (uid) fetchProfile(uid);
    },
  });
}
