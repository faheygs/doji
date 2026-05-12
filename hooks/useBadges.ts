import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import type { Badge, UserBadge } from '../types/database';

export function useBadgeDefinitions() {
  return useQuery<Badge[]>({
    queryKey: ['badges'],
    queryFn: async () => {
      const { data, error } = await supabase.from('badges').select('*');
      if (error) throw error;
      return data ?? [];
    },
    staleTime: Infinity,
  });
}

export function useUserBadges(userId: string | undefined) {
  return useQuery<UserBadge[]>({
    queryKey: ['userBadges', userId],
    queryFn: async () => {
      if (!userId) return [];
      const { data, error } = await supabase
        .from('user_badges')
        .select('*, badge:badges(*)')
        .eq('user_id', userId);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!userId,
    staleTime: 60_000,
  });
}
