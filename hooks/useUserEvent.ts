import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/useAuthStore';
import type { UserEvent, Post, Challenge, DailyEvent } from '../types/database';
import { uploadPostMedia, uploadPostVideo } from '../utils/upload';

export function useUserEvent() {
  const session = useAuthStore((s) => s.session);
  const userId = session?.user?.id;

  return useQuery({
    queryKey: ['userEvent', 'today', userId],
    queryFn: async (): Promise<UserEvent | null> => {
      if (!userId) return null;

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // One challenge per day — get the most recent event for today
      const { data, error } = await supabase
        .from('user_events')
        .select(
          `*, daily_event:daily_events(*, challenge:challenges(*))`,
        )
        .eq('user_id', userId)
        .gte('expires_at', today.toISOString())
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      if (!data) return null;

      type UserEventQueryRow = UserEvent & {
        daily_event?: DailyEvent & { challenge?: Challenge };
      };

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

      const statusUpdate = {
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
