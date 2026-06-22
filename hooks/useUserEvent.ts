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
import { makeDemoUserEvent, DEMO_CHALLENGES, DEMO_YOU_PROFILE } from '../constants/demoData';

export function useUserEvent() {
  const isDemoMode = useDemoStore((s) => s.isDemoMode);
  const demoChallengeType = useDemoStore((s) => s.demoChallengeType);
  const demoStatus = useDemoStore((s) => s.demoStatus);
  const session = useAuthStore((s) => s.session);
  const userId = session?.user?.id;

  const demoEvent = isDemoMode ? makeDemoUserEvent(demoChallengeType, demoStatus) : null;

  return useQuery({
    queryKey: isDemoMode
      ? (['userEvent', 'demo', demoChallengeType, demoStatus] as const)
      : (['userEvent', 'today', userId] as const),
    queryFn: async (): Promise<UserEvent | null> => {
      if (isDemoMode) return demoEvent;
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
    enabled: isDemoMode || !!userId,
    staleTime: isDemoMode ? Infinity : 1000 * 30,
    placeholderData: isDemoMode ? demoEvent : undefined,
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
      // In demo mode: skip all uploads and DB writes
      if (useDemoStore.getState().isDemoMode) return null;

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
    onMutate: async ({ isLate, photoUri, postType }) => {
      const userId = session?.user?.id;
      if (!userId) return;
      if (useDemoStore.getState().isDemoMode) {
        const store = useDemoStore.getState();
        const type = store.demoChallengeType;
        const isPhotoPost = postType === 'photo' || (!postType && !!photoUri);
        const youProfile = { ...DEMO_YOU_PROFILE, id: userId };
        const newPost = {
          id: `demo-post-mine-${Date.now()}`,
          user_event_id: null,
          user_id: userId,
          type: (isPhotoPost ? 'photo' : 'task_complete') as 'photo' | 'task_complete',
          caption: null,
          photo_url: isPhotoPost
            ? 'https://picsum.photos/seed/demo-my-post/600/600'
            : null,
          front_photo_url: null,
          video_url: null,
          is_late: isLate,
          selected_option_index: null,
          reaction_count: 0,
          comment_count: 0,
          comments_disabled: false,
          visibility: 'friends' as const,
          created_at: new Date().toISOString(),
          reaction_breakdown: {} as any,
          my_reactions: [],
          profile: youProfile,
          challenge: DEMO_CHALLENGES[type],
        };
        store.addDemoPost(newPost as any);
        store.completeDemoChallenge();
        return { prev: null, key: null };
      }
      const key = ['userEvent', 'today', userId] as const;
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
