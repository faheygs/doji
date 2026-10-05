// Read-only endpoint cases, derived from the member hooks. No commands here.
import type {SupabaseClient} from '@supabase/supabase-js';
export interface CanaryResponse {status:number;error:{code?:string}|null;data:unknown}
export interface ReadQuery extends PromiseLike<CanaryResponse> {retry(value:boolean):ReadQuery;abortSignal(signal:AbortSignal):ReadQuery}
export interface ReadCase {name:string;timeout:number;make():ReadQuery}
export function cases(client:SupabaseClient, member:{id:string;username:string}):ReadCase[] {
  const reads:ReadCase[] = [];
  const rpc = (name:string, args?:Record<string,unknown>, timeout = 8000) => reads.push({
    name, timeout, make: () => client.rpc(name, args),
  });
  const table = (name:string, make:()=>ReadQuery) => reads.push({ name, timeout: 8000, make });
  rpc('get_own_profile');
  rpc('get_current_doji_state', undefined, 6000);
  rpc('get_upcoming_doji_state', undefined, 6000);
  rpc('get_mobile_release_policy', { p_platform: 'android' }, 6000);
  rpc('get_my_moderation_status');
  rpc('get_current_profile_post', { p_user_id: member.id });
  rpc('get_reactions_given_count', { p_user_id: member.id });
  rpc('friend_count', { p_user_id: member.id });
  rpc('friend_request_count');
  rpc('blocked_user_count');
  rpc('list_my_friends_page', { p_before_accepted_at: null, p_before_id: null, p_limit: 50 });
  rpc('list_friend_requests_page', { p_before_created_at: null, p_before_id: null, p_limit: 50 });
  rpc('list_blocked_users_page', { p_before_created_at: null, p_before_id: null, p_limit: 50 });
  rpc('list_profile_friends_page', { p_profile_user_id: member.id, p_after_friend_id: null, p_limit: 50 });
  rpc('get_public_profile_view', { p_username: member.username });
  rpc('is_username_available', { p_username: member.username }, 6000);
  rpc('search_profiles', { p_query: member.username, p_limit: 20 });
  rpc('search_mentionable_profiles', { p_query: member.username, p_limit: 8 });
  for (const mode of ['weekly', 'alltime']) for (const audience of ['friends', 'everyone']) {
    reads.push({ name: `leaderboard.${mode}.${audience}`, timeout: 6000,
      make: () => client.rpc('get_leaderboard_snapshot', { p_mode: mode, p_audience: audience, p_limit: 50 }) });
  }
  table('shopCatalog', () => client.from('shop_items')
    .select('key, kind, name, price, sort_order, metadata, is_active, created_at')
    .eq('is_active', true).order('sort_order', { ascending: true }).limit(100));
  table('ownedShopItems', () => client.from('user_shop_items')
    .select('user_id, item_key, purchased_at').eq('user_id', member.id).limit(100));
  table('mySuggestions', () => client.from('challenge_suggestions')
    .select('id, user_id, kind, body, body_hash, options, status, admin_note, selected_at, reviewed_at, reviewed_by, created_at, reviewer:profiles!challenge_suggestions_reviewed_by_fkey(id, username, display_name, avatar_url)')
    .eq('user_id', member.id).order('created_at', { ascending: false }).limit(100));
  table('badges', () => client.from('badges').select('id, name, emoji, description, criteria_type, criteria_value').limit(100));
  table('userBadges', () => client.from('user_badges')
    .select('user_id, badge_id, earned_at, badge:badges(id, name, emoji, description, criteria_type, criteria_value)')
    .eq('user_id', member.id).limit(100));
  table('badgeCategories', () => client.from('badge_categories')
    .select('id, name, emoji, description, sort_order').order('sort_order', { ascending: true }).limit(100));
  table('badgeTiers', () => client.from('badge_tiers')
    .select('id, category_id, tier, criteria_type, criteria_value, sort_order').order('sort_order', { ascending: true }).limit(100));
  table('userBadgeProgress', () => client.from('user_badge_progress')
    .select('user_id, category_id, current_tier, unlocked_at').eq('user_id', member.id).limit(100));
  table('pollVotesCount', () => client.from('poll_votes').select('id', { count: 'exact', head: true }).eq('user_id', member.id));
  return reads;
}
