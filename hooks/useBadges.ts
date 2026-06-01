import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import type {
  Badge,
  BadgeCategory,
  BadgeTier,
  UserBadge,
  UserBadgeProgress,
} from '../types/database';

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

export function useBadgeCategories() {
  return useQuery<BadgeCategory[]>({
    queryKey: ['badgeCategories'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('badge_categories')
        .select('*')
        .order('sort_order', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    staleTime: Infinity,
  });
}

export function useBadgeTiers() {
  return useQuery<BadgeTier[]>({
    queryKey: ['badgeTiers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('badge_tiers')
        .select('*')
        .order('sort_order', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    staleTime: Infinity,
  });
}

export function useUserBadgeProgress(userId: string | undefined) {
  return useQuery<UserBadgeProgress[]>({
    queryKey: ['userBadgeProgress', userId],
    queryFn: async () => {
      if (!userId) return [];
      const { data, error } = await supabase
        .from('user_badge_progress')
        .select('*')
        .eq('user_id', userId);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!userId,
    staleTime: 60_000,
  });
}
