import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/useAuthStore';
import type { Profile, ShopItem, UserShopItem } from '../types/database';
import { scheduleQueryInvalidation } from '../lib/queryInvalidationBatcher';

export function useShopCatalog() {
  return useQuery({
    queryKey: ['shopCatalog'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('shop_items')
        .select('key, kind, name, price, sort_order, metadata, is_active, created_at')
        .eq('is_active', true)
        .order('sort_order', { ascending: true })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as ShopItem[];
    },
    staleTime: 60_000,
  });
}

export function useOwnedShopItems(userId: string | undefined) {
  return useQuery({
    queryKey: ['ownedShopItems', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_shop_items')
        .select('user_id, item_key, purchased_at')
        .eq('user_id', userId!)
        .limit(100);
      if (error) throw error;
      return (data ?? []) as UserShopItem[];
    },
  });
}

type ShopMutationContext = {
  previousProfile: Profile | null;
  previousOwned: UserShopItem[] | undefined;
};

function getCatalogItem(queryClient: QueryClient, itemKey: string): ShopItem | undefined {
  return queryClient.getQueryData<ShopItem[]>(['shopCatalog'])?.find((i) => i.key === itemKey);
}

function patchProfileForItem(profile: Profile, item: ShopItem): Profile {
  if (item.kind === 'theme') return { ...profile, accent_theme: item.key };
  if (item.kind === 'border') return { ...profile, equipped_border_key: item.key };
  if (item.kind === 'title') return { ...profile, equipped_title_key: item.key };
  return profile;
}

export function invalidateCosmeticQueries(
  queryClient: QueryClient,
  _userId: string,
  _username?: string | null,
) {
  scheduleQueryInvalidation(queryClient, ['ownedShopItems', 'profile', 'feed']);
}

function applyOptimisticEquip(
  queryClient: QueryClient,
  userId: string,
  item: ShopItem,
): ShopMutationContext | undefined {
  const { profile, setProfile } = useAuthStore.getState();
  if (!profile) return undefined;

  const previousProfile = profile;
  const previousOwned = queryClient.getQueryData<UserShopItem[]>(['ownedShopItems', userId]);

  setProfile(patchProfileForItem(profile, item));
  return { previousProfile, previousOwned };
}

function applyOptimisticPurchase(
  queryClient: QueryClient,
  userId: string,
  item: ShopItem,
): ShopMutationContext | undefined {
  const ctx = applyOptimisticEquip(queryClient, userId, item);
  if (!ctx?.previousProfile) return ctx;

  const { setProfile } = useAuthStore.getState();
  setProfile({
    ...patchProfileForItem(ctx.previousProfile, item),
    sparks: Math.max(0, (ctx.previousProfile.sparks ?? 0) - item.price),
  });

  const previousOwned = ctx.previousOwned ?? [];
  if (!previousOwned.some((o) => o.item_key === item.key)) {
    queryClient.setQueryData<UserShopItem[]>(['ownedShopItems', userId], [
      ...previousOwned,
      { user_id: userId, item_key: item.key, purchased_at: new Date().toISOString() },
    ]);
  }

  return ctx;
}

function rollbackOptimistic(
  queryClient: QueryClient,
  ctx: ShopMutationContext | undefined,
  userId: string | undefined,
) {
  if (!ctx || !userId) return;
  if (ctx.previousProfile) {
    useAuthStore.getState().setProfile(ctx.previousProfile);
  }
  if (ctx.previousOwned !== undefined) {
    queryClient.setQueryData(['ownedShopItems', userId], ctx.previousOwned);
  }
}

export function usePurchaseShopItem() {
  const queryClient = useQueryClient();
  const userId = useAuthStore((s) => s.session?.user?.id);
  const username = useAuthStore((s) => s.profile?.username);
  const fetchProfile = useAuthStore((s) => s.fetchProfile);

  return useMutation({
    mutationFn: async (itemKey: string) => {
      const { data, error } = await supabase.rpc('purchase_shop_item', {
        p_item_key: itemKey,
      });
      if (error) throw error;
      return data as { item_key: string; sparks: number };
    },
    onMutate: async (itemKey) => {
      if (!userId) return undefined;
      const item = getCatalogItem(queryClient, itemKey);
      if (!item) return undefined;
      return applyOptimisticPurchase(queryClient, userId, item);
    },
    onError: (_err, _itemKey, ctx) => {
      rollbackOptimistic(queryClient, ctx, userId);
    },
    onSuccess: async (data) => {
      const profile = useAuthStore.getState().profile;
      if (profile) {
        useAuthStore.getState().setProfile({ ...profile, sparks: data.sparks });
      }
    },
    onSettled: async () => {
      if (!userId) return;
      invalidateCosmeticQueries(queryClient, userId, username);
      await fetchProfile(userId);
    },
  });
}

export function useEquipShopItem() {
  const queryClient = useQueryClient();
  const userId = useAuthStore((s) => s.session?.user?.id);
  const username = useAuthStore((s) => s.profile?.username);
  const fetchProfile = useAuthStore((s) => s.fetchProfile);

  return useMutation({
    mutationFn: async (itemKey: string) => {
      const { data, error } = await supabase.rpc('equip_shop_item', {
        p_item_key: itemKey,
      });
      if (error) throw error;
      return data as { item_key: string };
    },
    onMutate: async (itemKey) => {
      if (!userId) return undefined;
      const item = getCatalogItem(queryClient, itemKey);
      if (!item) return undefined;
      return applyOptimisticEquip(queryClient, userId, item);
    },
    onError: (_err, _itemKey, ctx) => {
      if (ctx?.previousProfile) {
        useAuthStore.getState().setProfile(ctx.previousProfile);
      }
    },
    onSettled: async () => {
      if (!userId) return;
      invalidateCosmeticQueries(queryClient, userId, username);
      await fetchProfile(userId);
    },
  });
}

export function isShopItemOwned(owned: UserShopItem[] | undefined, key: string): boolean {
  return owned?.some((o) => o.item_key === key) ?? false;
}
