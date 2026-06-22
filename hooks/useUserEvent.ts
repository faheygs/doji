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
import { useDemoStore } from '../stores/useDemoStore';

export function useUserEvent() {
  const activeDemoUserEvent = useDemoStore((s) => s.activeDemoUserEvent);
  const session = useAuthStore((s) => s.session);
  const userId = session?.user?.id;

  return useQuery({
    queryKey: activeDemoUserEvent
      ? ['userEvent', 'demo', activeDemoUserEvent.id]
      : ['userEvent', 'today', userId],
    queryFn: async (): Promise<UserEvent | null> => {
      if (activeDemoUserEvent) return activeDemoUserEvent;
      if (!userId) return null;

      const { start, end } = todayFiresAtWindow();

      const { data: dailyEvents, error: deErr } = await supabase
        .from('daily_events')
        .select('id')
        .gte('fires_at', start)
        .lt('fires_at', end);

      if (deErr) throw deErr;
      const dailyIds = (dailyEvents ?? []).map((e: { id: string }) => e.id);

      type UserEventQueryRow = UserEvent & {
        daily_event?: DailyEvent & { challenge?: Challenge };
      };

      // One row per user per daily_event — latest if duplicates
      // If dailyIds is empty (fires_at crosses a timezone day boundary vs local midnight),
      // skip to ensure_today_user_event which uses Pacific time on the server.
      const { data, error } = dailyIds.length > 0 ? await supabase
        .from('user_events')
        .select(`*, daily_event:daily_events(*, challenge:challenges(*))`)
        .eq('user_id', userId)
        .in('daily_event_id', dailyIds)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle() : { data: null, error: null };

      if (error) throw error;
      if (!data) {
        const { data: ensured, error: ensureErr } = await supabase.rpc('ensure_today_user_event');
        if (ensureErr) {
          if (__DEV__) console.warn('[useUserEvent] ensure_today_user_event', ensureErr.message);
          return null;
        }
        if (!ensured) return null;

        const row = ensured as UserEvent;
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
    enabled: activeDemoUserEvent ? true : !!userId,
    staleTime: activeDemoUserEvent ? Infinity : 1000 * 30,
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

      const [photoUrl, frontPhotoUrl, videoUrl] = await Promise.all([
        payload.photoUri ? uploadPostMedia(userId, payload.photoUri, 'photo') : Promise.resolve(null),
        payload.frontPhotoUri ? uploadPostMedia(userId, payload.frontPhotoUri, 'front') : Promise.resolve(null),
        payload.videoUri ? uploadPostVideo(userId, payload.videoUri) : Promise.resolve(null),
      ]);

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
    onMutate: async ({ isLate }) => {
      const userId = session?.user?.id;
      if (!userId) return;
      const activeDemoUserEvent = useDemoStore.getState().activeDemoUserEvent;
      const key = activeDemoUserEvent
        ? (['userEvent', 'demo', activeDemoUserEvent.id] as const)
        : (['userEvent', 'today', userId] as const);
      await queryClient.cancelQueries({ queryKey: key });
      const prev = queryClient.getQueryData<UserEvent | null>(key);
      if (prev) {
        queryClient.setQueryData<UserEvent>(key, {
          ...prev,
          status: isLate ? 'late' : 'completed',
          completed_at: new Date().toISOString(),
        });
      }
      return { prev, key };
    },
    onError: (_err, _vars, ctx) => {
      if (!ctx?.prev || !ctx?.key) return;
      queryClient.setQueryData(ctx.key as any, ctx.prev);
    },
    onSuccess: async () => {
      void queryClient.invalidateQueries({ queryKey: ['userEvent', 'today'], refetchType: 'none' });
      void queryClient.invalidateQueries({ queryKey: ['profile'] });
      void queryClient.invalidateQueries({ queryKey: ['leaderboard'] });
      void queryClient.invalidateQueries({ queryKey: ['profilePosts'] });
      try {
        await queryClient.refetchQueries({ queryKey: ['feed'] });
      } catch {
        // Non-fatal — navigation still proceeds; user can pull-to-refresh.
      }
      const uid = session?.user?.id;
      if (uid) fetchProfile(uid);
    },
  });
}
