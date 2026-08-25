import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import type {
  Badge,
  BadgeCategory,
  BadgeTier,
  UserBadge,
  UserBadgeProgress,
} from '../types/database';
import { runAbortableQuery } from '../lib/requestSignal';

export function useBadgeDefinitions() {
  return useQuery<Badge[]>({
    queryKey: ['badges'],
    queryFn: async ({ signal }) => {
      const { data, error } = await runAbortableQuery(supabase
        .from('badges')
        .select('id, name, emoji, description, criteria_type, criteria_value')
        .limit(100), signal);
      if (error) throw error;
      return data ?? [];
    },
    staleTime: Infinity,
  });
}

export function useUserBadges(userId: string | undefined) {
  return useQuery<UserBadge[]>({
    queryKey: ['userBadges', userId],
    queryFn: async ({ signal }) => {
      if (!userId) return [];
      const { data, error } = await runAbortableQuery(supabase
        .from('user_badges')
        .select('user_id, badge_id, earned_at, badge:badges(id, name, emoji, description, criteria_type, criteria_value)')
        .eq('user_id', userId)
        .limit(100), signal);
      if (error) throw error;
      return (data ?? []) as unknown as UserBadge[];
    },
    enabled: !!userId,
    staleTime: 60_000,
  });
}

export function useBadgeCategories() {
  return useQuery<BadgeCategory[]>({
    queryKey: ['badgeCategories'],
    queryFn: async ({ signal }) => {
      const { data, error } = await runAbortableQuery(supabase
        .from('badge_categories')
        .select('id, name, emoji, description, sort_order')
        .order('sort_order', { ascending: true })
        .limit(100), signal);
      if (error) throw error;
      return data ?? [];
    },
    staleTime: Infinity,
  });
}

export function useBadgeTiers() {
  return useQuery<BadgeTier[]>({
    queryKey: ['badgeTiers'],
    queryFn: async ({ signal }) => {
      const { data, error } = await runAbortableQuery(supabase
        .from('badge_tiers')
        .select('id, category_id, tier, criteria_type, criteria_value, sort_order')
        .order('sort_order', { ascending: true })
        .limit(100), signal);
      if (error) throw error;
      return data ?? [];
    },
    staleTime: Infinity,
  });
}

export function useUserBadgeProgress(userId: string | undefined) {
  return useQuery<UserBadgeProgress[]>({
    queryKey: ['userBadgeProgress', userId],
    queryFn: async ({ signal }) => {
      if (!userId) return [];
      const { data, error } = await runAbortableQuery(supabase
        .from('user_badge_progress')
        .select('user_id, category_id, current_tier, unlocked_at')
        .eq('user_id', userId)
        .limit(100), signal);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!userId,
    staleTime: 60_000,
  });
}
