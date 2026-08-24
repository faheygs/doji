import type { ThemeName } from '../constants/theme';

export type ReactionEmoji = 'fire' | 'like' | 'dislike' | 'laugh' | 'wow' | 'heart';

/** Stored on profiles.notification_preferences (jsonb). */
export type NotificationPreferences = {
  push_enabled: boolean;
  /** Legacy compatibility field; unread badges now follow unread activity. */
  show_bell_badge: boolean;
  doji_start: boolean;
  friend_post: boolean;
  reactions_on_my_post: boolean;
  friend_request: boolean;
  friend_accepted: boolean;
  badges: boolean;
  comment: boolean;
  mention: boolean;
  suggestion: boolean;
  comment_reply: boolean;
};

export type NotificationCenterState = {
  user_id: string;
  cleared_at: string | null;
  last_opened_at: string | null;
  updated_at: string;
};

export type NotificationDismissal = {
  user_id: string;
  notification_key: string;
  dismissed_at: string;
};

export type DevicePushEndpoint = {
  id: string;
  user_id: string;
  installation_id: string;
  provider: 'apns' | 'fcm';
  platform: 'ios' | 'android';
  environment: 'sandbox' | 'production';
  token: string;
  active: boolean;
  created_at: string;
  last_registered_at: string;
  invalidated_at: string | null;
};

export type Profile = {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  avatar_gradient: [string, string];
  bio: string | null;
  current_streak: number;
  longest_streak: number;
  total_completions: number;
  total_missed: number;
  xp: number;
  level: number;
  reactions_received: number;
  reactions_given: number;
  streak_shields: number;
  notification_token: string | null;
  notification_preferences?: NotificationPreferences;
  /** Color theme (`ThemeName`); stored in DB, default `dark`. Legacy — prefer appearance_mode. */
  app_theme: ThemeName;
  sparks: number;
  accent_theme: string;
  appearance_mode: ThemeName;
  equipped_border_key: string | null;
  equipped_title_key: string | null;
  timezone: string;
  is_admin: boolean;
  is_banned: boolean;
  is_demo_account: boolean;
  onboarding_completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ChallengeType = 'photo' | 'poll' | 'task' | 'format';
export type PollKind = 'poll' | 'wyr';

export type AnswerRuleType = 'starts_with_letter' | 'exact_word_count';

export type AnswerRule =
  | { type: 'starts_with_letter'; letter: string }
  | { type: 'exact_word_count'; count: number };

export type Challenge = {
  id: string;
  title: string;
  description: string;
  type: ChallengeType;
  poll_kind?: PollKind | null;
  emoji: string | null;
  category: 'physical' | 'creative' | 'social' | 'mental' | 'wild';
  difficulty: 1 | 2 | 3;
  xp_reward: number;
  participant_count: number;
  requires_photo: boolean;
  requires_video: boolean;
  requires_text: boolean;
  answer_rule?: AnswerRule | null;
  is_active: boolean;
  is_demo: boolean;
  /** Times this challenge has been assigned to a daily_event; scheduler prefers lower values. */
  schedule_count: number;
  poll_options?: PollOption[];
  created_at: string;
};

export type PollOption = {
  id: string;
  challenge_id: string;
  text: string;
  vote_count: number;
  position: number;
  is_other?: boolean;
  created_at: string;
};

export type PollVote = {
  id: string;
  user_id: string;
  challenge_id: string;
  option_id: string;
  user_event_id?: string | null;
  idempotency_key?: string | null;
  custom_text?: string | null;
  created_at: string;
};

export type PollVoteLike = {
  id: string;
  user_id: string;
  poll_vote_id: string;
  created_at: string;
};

export type Block = {
  id: string;
  blocker_id: string;
  blocked_id: string;
  created_at: string;
};

export type DailyEvent = {
  id: string;
  challenge_id: string;
  fires_at: string;
  window_minutes: number;
  push_sent_at: string | null;
  activated_at?: string | null;
  prelive_at?: string | null;
  closes_at?: string | null;
  closed_at?: string | null;
  created_at: string;
  challenge?: Challenge;
};

export type UserEventStatus = 'pending' | 'completed' | 'missed' | 'late' | 'buy_in_open';

export type UserEvent = {
  id: string;
  user_id: string;
  daily_event_id: string;
  status: UserEventStatus;
  notified_at: string | null;
  completed_at: string | null;
  expires_at: string;
  buy_in_at: string | null;
  streak_before_miss: number | null;
  signup_day_grace?: boolean;
  created_at: string;
  daily_event?: DailyEvent;
  challenge?: Challenge;
};

export type ShopItemKind = 'theme' | 'border' | 'title';

export type ShopItem = {
  key: string;
  kind: ShopItemKind;
  name: string;
  price: number;
  sort_order: number;
  metadata: Record<string, unknown>;
  is_active: boolean;
  created_at: string;
};

export type UserShopItem = {
  user_id: string;
  item_key: string;
  purchased_at: string;
};

export type SparkLedgerReason =
  | 'challenge_complete'
  | 'level_up'
  | 'badge_unlock'
  | 'buy_in'
  | 'purchase'
  | 'welcome_bonus'
  | 'comment'
  | 'reaction'
  | 'post'
  | 'poll_vote'
  | 'friend_request'
  | 'friend_accept'
  | 'suggestion_approved'
  | 'app_review_credit';

export type SparkLedgerEntry = {
  id: string;
  user_id: string;
  delta: number;
  balance_after: number;
  reason: SparkLedgerReason;
  ref_id: string | null;
  created_at: string;
};

export type PostType = 'photo' | 'poll_vote' | 'task_complete';

export type Post = {
  id: string;
  user_event_id: string | null;
  user_id: string | null;
  type: PostType;
  is_community_poll?: boolean;
  daily_event_id?: string | null;
  caption: string | null;
  photo_url: string | null;
  front_photo_url: string | null;
  video_url: string | null;
  is_late: boolean;
  selected_option_index: number | null;
  reaction_count: number;
  comment_count: number;
  comments_disabled: boolean;
  is_demo?: boolean;
  visibility: 'friends' | 'public';
  created_at: string;
  idempotency_key?: string | null;
  reaction_breakdown?: Record<ReactionEmoji, number>;
  my_reactions?: ReactionEmoji[];
  profile?: Profile;
  challenge?: Challenge;
  daily_event?: DailyEvent;
  poll_option_text?: string;
};

export type FriendshipStatus = 'pending' | 'accepted' | 'blocked';

export type Friendship = {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: FriendshipStatus;
  created_at: string;
  accepted_at: string | null;
  requester?: Profile;
  addressee?: Profile;
};

export type FriendshipWithRequester = Friendship & {
  requester?: Profile | null;
};

export type Reaction = {
  id: string;
  post_id: string;
  user_id: string;
  emoji: ReactionEmoji;
  created_at: string;
  profile?: Profile;
  friendship_status?: 'self' | 'friends' | 'pending_out' | 'pending_in' | 'none';
};

export type Comment = {
  id: string;
  post_id: string;
  user_id: string;
  parent_id: string | null;
  reply_to_comment_id: string | null;
  body: string;
  like_count: number;
  created_at: string;
  updated_at: string | null;
  body_edited: boolean;
  idempotency_key?: string | null;
  profile?: Profile;
  /** Filled client-side for the signed-in user. */
  my_like?: boolean;
};

export type CommentLike = {
  id: string;
  comment_id: string;
  user_id: string;
  created_at: string;
};

export type CommentMention = {
  id: string;
  comment_id: string;
  mentioned_user_id: string;
  created_at: string;
};

export type StreakEvent = {
  id: string;
  user_id: string;
  event_type: 'extend' | 'break' | 'start';
  streak_value: number;
  created_at: string;
};

export type Badge = {
  id: string;
  name: string;
  emoji: string;
  description: string;
  criteria_type: string;
  criteria_value: number;
};

export type UserBadge = {
  user_id: string;
  badge_id: string;
  earned_at: string;
  badge?: Badge;
};

export type BadgeTierName = 'bronze' | 'silver' | 'gold' | 'diamond';

export type BadgeCategory = {
  id: string;
  name: string;
  emoji: string;
  description: string;
  sort_order: number;
};

export type BadgeTier = {
  id: string;
  category_id: string;
  tier: BadgeTierName;
  criteria_type: string;
  criteria_value: number;
  sort_order: number;
};

export type UserBadgeProgress = {
  user_id: string;
  category_id: string;
  current_tier: BadgeTierName;
  unlocked_at: string;
};

export type ChallengeSuggestionStatus = 'pending' | 'approved' | 'rejected';

export type ChallengeSuggestion = {
  id: string;
  user_id: string;
  kind: string;
  body: string;
  body_hash: string;
  options: unknown;
  status: ChallengeSuggestionStatus;
  admin_note: string | null;
  selected_at: string | null;
  reviewed_at: string | null;
  reviewed_by: string | null;
  created_at: string;
  profile?: Profile;
  reviewer?: Pick<Profile, 'id' | 'username' | 'display_name' | 'avatar_url'> | null;
};

export type WeeklyXp = {
  user_id: string;
  week_start: string;
  xp: number;
};

export type LeaderboardEntry = {
  rank: number;
  user_id: string;
  xp: number;
  profile: Profile;
};

export type ReportReason = 'spam' | 'inappropriate' | 'harassment' | 'other';
export type ReportStatus = 'pending' | 'dismissed' | 'actioned';

export type Report = {
  id: string;
  reporter_id: string;
  reported_user_id: string | null;
  post_id: string | null;
  comment_id: string | null;
  poll_vote_id: string | null;
  reason: ReportReason;
  status: ReportStatus;
  notes: string | null;
  created_at: string;
  reporter?: Pick<
    Profile,
    'username' | 'display_name' | 'avatar_url' | 'equipped_border_key'
  > | null;
  reported_user?: Pick<
    Profile,
    'username' | 'display_name' | 'avatar_url' | 'equipped_border_key'
  > | null;
  post?: { caption: string | null; photo_url: string | null } | null;
  comment?: { body: string | null } | null;
  poll_vote?: { custom_text: string | null } | null;
};

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: Omit<Profile, 'created_at' | 'updated_at'>;
        Update: Partial<Profile>;
        Relationships: [];
      };
      notification_center_state: {
        Row: NotificationCenterState;
        Insert: Omit<NotificationCenterState, 'updated_at'> & { updated_at?: string };
        Update: Partial<Omit<NotificationCenterState, 'user_id'>>;
        Relationships: [];
      };
      notification_dismissals: {
        Row: NotificationDismissal;
        Insert: NotificationDismissal;
        Update: Pick<NotificationDismissal, 'dismissed_at'>;
        Relationships: [];
      };
      device_push_endpoints: {
        Row: DevicePushEndpoint;
        Insert: Omit<DevicePushEndpoint, 'id' | 'created_at' | 'last_registered_at'>;
        Update: Partial<Omit<DevicePushEndpoint, 'id' | 'user_id'>>;
        Relationships: [];
      };
      challenges: {
        Row: Challenge;
        Insert: Omit<Challenge, 'id' | 'created_at'>;
        Update: Partial<Challenge>;
        Relationships: [];
      };
      challenge_suggestions: {
        Row: ChallengeSuggestion;
        Insert: {
          user_id: string;
          kind: string;
          body: string;
          body_hash: string;
          options?: unknown;
        };
        Update: Partial<ChallengeSuggestion>;
        Relationships: [];
      };
      daily_events: {
        Row: DailyEvent;
        Insert: Omit<DailyEvent, 'id' | 'created_at'>;
        Update: Partial<DailyEvent>;
        Relationships: [];
      };
      user_events: {
        Row: UserEvent;
        Insert: Omit<UserEvent, 'id' | 'created_at'>;
        Update: Partial<UserEvent>;
        Relationships: [];
      };
      posts: {
        Row: Post;
        Insert: {
          user_event_id?: string | null;
          user_id?: string | null;
          type?: PostType;
          is_community_poll?: boolean;
          daily_event_id?: string | null;
          caption?: string | null;
          photo_url?: string | null;
          front_photo_url?: string | null;
          video_url?: string | null;
          is_late: boolean;
          selected_option_index?: number | null;
          is_demo?: boolean;
          visibility: 'friends' | 'public';
        };
        Update: Partial<Post>;
        Relationships: [];
      };
      friendships: {
        Row: Friendship;
        Insert: Omit<Friendship, 'id' | 'created_at' | 'accepted_at'>;
        Update: Partial<Friendship>;
        Relationships: [];
      };
      reactions: {
        Row: Reaction;
        Insert: Omit<Reaction, 'id' | 'created_at'>;
        Update: Partial<Reaction>;
        Relationships: [];
      };
      comments: {
        Row: Comment;
        Insert: Omit<
          Comment,
          'id' | 'created_at' | 'like_count' | 'my_like' | 'updated_at' | 'body_edited'
        >;
        Update: Partial<Comment>;
        Relationships: [];
      };
      comment_mentions: {
        Row: CommentMention;
        Insert: Omit<CommentMention, 'id' | 'created_at'>;
        Update: Partial<CommentMention>;
        Relationships: [];
      };
      comment_likes: {
        Row: CommentLike;
        Insert: Omit<CommentLike, 'id' | 'created_at'>;
        Update: Partial<CommentLike>;
        Relationships: [];
      };
      streak_events: {
        Row: StreakEvent;
        Insert: Omit<StreakEvent, 'id' | 'created_at'>;
        Update: Partial<StreakEvent>;
        Relationships: [];
      };
      poll_options: {
        Row: PollOption;
        Insert: Omit<PollOption, 'id' | 'created_at'>;
        Update: Partial<PollOption>;
        Relationships: [];
      };
      poll_votes: {
        Row: PollVote;
        Insert: Omit<PollVote, 'id' | 'created_at'>;
        Update: Partial<PollVote>;
        Relationships: [];
      };
      poll_vote_likes: {
        Row: PollVoteLike;
        Insert: Omit<PollVoteLike, 'id' | 'created_at'>;
        Update: Partial<PollVoteLike>;
        Relationships: [];
      };
      blocks: {
        Row: Block;
        Insert: Omit<Block, 'id' | 'created_at'>;
        Update: Partial<Block>;
        Relationships: [];
      };
      reports: {
        Row: Report;
        Insert: Omit<
          Report,
          | 'id'
          | 'created_at'
          | 'status'
          | 'notes'
          | 'reporter'
          | 'reported_user'
          | 'post'
          | 'comment'
          | 'poll_vote'
        >;
        Update: { status?: ReportStatus; notes?: string | null };
        Relationships: [];
      };
      badges: {
        Row: Badge;
        Insert: Badge;
        Update: Partial<Badge>;
        Relationships: [];
      };
      user_badges: {
        Row: UserBadge;
        Insert: Omit<UserBadge, 'earned_at'>;
        Update: Partial<UserBadge>;
        Relationships: [];
      };
      badge_categories: {
        Row: BadgeCategory;
        Insert: BadgeCategory;
        Update: Partial<BadgeCategory>;
        Relationships: [];
      };
      badge_tiers: {
        Row: BadgeTier;
        Insert: BadgeTier;
        Update: Partial<BadgeTier>;
        Relationships: [];
      };
      user_badge_progress: {
        Row: UserBadgeProgress;
        Insert: Omit<UserBadgeProgress, 'unlocked_at'> & { unlocked_at?: string };
        Update: Partial<UserBadgeProgress>;
        Relationships: [];
      };
      weekly_xp: {
        Row: WeeklyXp;
        Insert: WeeklyXp;
        Update: Partial<WeeklyXp>;
        Relationships: [];
      };
      shop_items: {
        Row: ShopItem;
        Insert: Omit<ShopItem, 'created_at'>;
        Update: Partial<ShopItem>;
        Relationships: [];
      };
      user_shop_items: {
        Row: UserShopItem;
        Insert: UserShopItem;
        Update: Partial<UserShopItem>;
        Relationships: [];
      };
      spark_ledger: {
        Row: SparkLedgerEntry;
        Insert: Omit<SparkLedgerEntry, 'id' | 'created_at'>;
        Update: Partial<SparkLedgerEntry>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      get_own_profile: {
        Args: Record<string, never>;
        Returns: Profile;
      };
      register_push_token: {
        Args: { p_token: string };
        Returns: boolean;
      };
      unregister_push_token: {
        Args: Record<string, never>;
        Returns: boolean;
      };
      register_native_push_endpoint: {
        Args: {
          p_installation_id: string;
          p_token: string;
          p_platform: 'ios' | 'android';
          p_environment: 'sandbox' | 'production';
          p_expo_token?: string | null;
        };
        Returns: boolean;
      };
      unregister_push_installation: {
        Args: { p_installation_id: string; p_expo_token?: string | null };
        Returns: boolean;
      };
      friend_count: {
        Args: { p_user_id: string };
        Returns: number;
      };
      can_view_profile: {
        Args: { p_viewer: string; p_target: string };
        Returns: boolean;
      };
      list_profile_friends: {
        Args: { p_profile_user_id: string };
        Returns: {
          friend_id: string;
          username: string;
          display_name: string;
          avatar_url: string | null;
          avatar_gradient: string[];
          equipped_border_key: string | null;
        }[];
      };
      level_from_xp: {
        Args: { p_xp: number };
        Returns: number;
      };
      purchase_shop_item: {
        Args: { p_item_key: string };
        Returns: { item_key: string; sparks: number };
      };
      equip_shop_item: {
        Args: { p_item_key: string };
        Returns: { item_key: string };
      };
      buy_in_today: {
        Args: Record<string, never>;
        Returns: { user_event_id: string; sparks: number; expires_at: string };
      };
      get_profile_by_username: {
        Args: { p_username: string };
        Returns: Profile | null;
      };
      get_public_profile_view: {
        Args: { p_username: string };
        Returns: {
          status: 'visible' | 'blocked_by_user' | 'not_found';
          profile: Profile | null;
        };
      };
      get_pending_reports_snapshot: {
        Args: { p_limit?: number };
        Returns: Report[];
      };
      get_pending_suggestions_snapshot: {
        Args: { p_limit?: number };
        Returns: ChallengeSuggestion[];
      };
      ensure_today_user_event: {
        Args: Record<string, never>;
        Returns: UserEvent | null;
      };
      get_reactions_given_count: {
        Args: { p_user_id: string };
        Returns: number;
      };
      ensure_demo_user_events: {
        Args: { p_user_id: string };
        Returns: void;
      };
      get_current_doji_state: {
        Args: Record<string, never>;
        Returns: {
          server_now: string;
          phase: 'none' | 'waiting' | 'live' | 'completed' | 'missed';
          opens_at?: string | null;
          closes_at?: string | null;
          user_event: UserEvent | null;
        };
      };
      get_upcoming_doji_state: {
        Args: Record<string, never>;
        Returns: {
          server_now: string;
          daily_event_id: string;
          prelive_at: string;
          fires_at: string;
        } | null;
      };
      get_locked_feed_previews: {
        Args: {
          p_daily_event_ids: string[];
          p_audience?: 'friends' | 'everyone';
          p_limit?: number;
          p_offset?: number;
        };
        Returns: Post[];
      };
      get_feed_page_snapshot: {
        Args: {
          p_daily_event_id: string;
          p_audience?: 'friends' | 'everyone';
          p_limit?: number;
          p_offset?: number;
        };
        Returns: Post[];
      };
      get_feed_page_snapshot_v2: {
        Args: {
          p_daily_event_id: string;
          p_audience?: 'friends' | 'everyone';
          p_limit?: number;
          p_before_created_at?: string | null;
          p_before_id?: string | null;
        };
        Returns: Post[];
      };
      get_comment_thread_snapshot: {
        Args: {
          p_post_id: string;
          p_audience?: 'friends' | 'everyone';
          p_before_created_at?: string | null;
          p_before_id?: string | null;
          p_limit?: number;
        };
        Returns: Comment[];
      };
      search_profiles: {
        Args: { p_query?: string; p_limit?: number };
        Returns: Array<
          Profile & {
            friendship_status: 'none' | 'friends' | 'pending_out' | 'pending_in' | 'blocked';
          }
        >;
      };
      search_mentionable_profiles: {
        Args: { p_query?: string; p_limit?: number };
        Returns: Profile[];
      };
      reserve_doji_media_upload: {
        Args: {
          p_user_event_id: string;
          p_idempotency_key: string;
          p_slot: 'photo' | 'front' | 'video';
          p_extension: string;
          p_content_type: string;
        };
        Returns: {
          id: string;
          bucket_id: 'post-media';
          object_path: string;
          content_type: string;
        };
      };
      get_leaderboard_snapshot: {
        Args: {
          p_mode?: 'weekly' | 'alltime';
          p_audience?: 'friends' | 'everyone';
          p_limit?: number;
        };
        Returns: LeaderboardEntry[];
      };
      list_profile_friends_page: {
        Args: {
          p_profile_user_id: string;
          p_limit?: number;
          p_after_friend_id?: string | null;
        };
        Returns: Array<{
          friend_id: string;
          username: string;
          display_name: string;
          avatar_url: string | null;
          avatar_gradient: string[];
          equipped_border_key: string | null;
        }>;
      };
      list_my_friends_page: {
        Args: {
          p_before_accepted_at?: string | null;
          p_before_id?: string | null;
          p_limit?: number;
        };
        Returns: Array<{
          friendship_id: string;
          friend_id: string;
          username: string;
          display_name: string;
          avatar_url: string | null;
          avatar_gradient: string[];
          current_streak: number;
          equipped_border_key: string | null;
          accepted_at: string;
        }>;
      };
      list_blocked_users_page: {
        Args: {
          p_before_created_at?: string | null;
          p_before_id?: string | null;
          p_limit?: number;
        };
        Returns: Array<{
          block_id: string;
          blocked_at: string;
          id: string;
          username: string;
          display_name: string;
          avatar_url: string | null;
          equipped_border_key: string | null;
        }>;
      };
      blocked_user_count: {
        Args: Record<string, never>;
        Returns: number;
      };
      list_friend_requests_page: {
        Args: {
          p_before_created_at?: string | null;
          p_before_id?: string | null;
          p_limit?: number;
        };
        Returns: Array<{
          id: string;
          requester_id: string;
          addressee_id: string;
          status: string;
          created_at: string;
          accepted_at: string | null;
          requester_username: string;
          requester_display_name: string;
          requester_avatar_url: string | null;
          requester_avatar_gradient: string[];
          requester_equipped_border_key: string | null;
        }>;
      };
      friend_request_count: {
        Args: Record<string, never>;
        Returns: number;
      };
      get_post_detail: {
        Args: { p_post_id: string };
        Returns: Post | null;
      };
      get_notification_center_snapshot: {
        Args: {
          p_since: string;
          p_limit?: number;
        };
        Returns: Record<string, unknown>[];
      };
      get_poll_votes_for_feed: {
        Args: {
          p_daily_event_id: string;
          p_audience?: 'friends' | 'everyone';
        };
        Returns: {
          id: string;
          option_id: string;
          user_id: string;
          custom_text: string | null;
          created_at: string;
        }[];
      };
      get_poll_snapshot_for_feed: {
        Args: {
          p_daily_event_id: string;
          p_audience?: 'friends' | 'everyone';
        };
        Returns: {
          option_id: string;
          challenge_id: string;
          option_text: string;
          option_position: number;
          option_is_other: boolean;
          option_created_at: string;
          vote_id: string | null;
          user_id: string | null;
          custom_text: string | null;
          vote_created_at: string | null;
          username: string | null;
          display_name: string | null;
          avatar_url: string | null;
          equipped_border_key: string | null;
        }[];
      };
      get_poll_results_summary: {
        Args: {
          p_daily_event_id: string;
          p_audience?: 'friends' | 'everyone';
        };
        Returns: {
          option_id: string;
          challenge_id: string;
          option_text: string;
          option_position: number;
          option_is_other: boolean;
          option_created_at: string;
          vote_count: number;
          is_my_vote: boolean;
          preview_voters: Array<{
            vote_id: string;
            user_id: string;
            username: string;
            display_name: string | null;
            avatar_url: string | null;
            equipped_border_key: string | null;
          }>;
        }[];
      };
      get_poll_option_voters_page: {
        Args: {
          p_daily_event_id: string;
          p_option_id: string;
          p_audience?: 'friends' | 'everyone';
          p_limit?: number;
          p_before_created_at?: string | null;
          p_before_id?: string | null;
        };
        Returns: Array<{
          vote_id: string;
          user_id: string;
          custom_text: string | null;
          created_at: string;
          username: string;
          display_name: string | null;
          avatar_url: string | null;
          equipped_border_key: string | null;
          like_count: number;
          my_like: boolean;
          friendship_status: 'self' | 'friends' | 'pending_out' | 'pending_in' | 'none';
        }>;
      };
      get_post_reaction_voters_page: {
        Args: {
          p_post_id: string;
          p_audience?: 'friends' | 'everyone';
          p_limit?: number;
          p_before_created_at?: string | null;
          p_before_id?: string | null;
        };
        Returns: Reaction[];
      };
      get_comment_like_voters_page: {
        Args: {
          p_comment_id: string;
          p_limit?: number;
          p_before_created_at?: string | null;
          p_before_id?: string | null;
        };
        Returns: Array<{
          id: string;
          user_id: string;
          created_at: string;
          friendship_status: 'self' | 'friends' | 'pending_out' | 'pending_in' | 'none';
          profile: Pick<
            Profile,
            'id' | 'username' | 'display_name' | 'avatar_url' | 'equipped_border_key'
          >;
        }>;
      };
      get_post_reaction_summaries: {
        Args: { p_post_ids: string[] };
        Returns: Array<{
          post_id: string;
          reaction_breakdown: Record<string, number>;
          my_reactions: ReactionEmoji[];
        }>;
      };
      get_post_engagement_snapshot: {
        Args: { p_post_id: string };
        Returns: {
          post_id: string;
          reaction_count: number;
          comment_count: number;
          reaction_breakdown: Record<ReactionEmoji, number>;
          my_reactions: ReactionEmoji[];
        } | null;
      };
      get_post_engagement_snapshot_v2: {
        Args: { p_post_id: string; p_audience?: 'friends' | 'everyone' };
        Returns: {
          post_id: string;
          reaction_count: number;
          comment_count: number;
          reaction_breakdown: Record<ReactionEmoji, number>;
          my_reactions: ReactionEmoji[];
        } | null;
      };
      submit_poll_vote: {
        Args: {
          p_user_event_id: string;
          p_option_id: string;
          p_custom_text: string | null;
          p_idempotency_key: string;
        };
        Returns: PollVote;
      };
      complete_doji_with_post: {
        Args: {
          p_user_event_id: string;
          p_post_type: string;
          p_caption: string;
          p_photo_url: string | null;
          p_front_photo_url: string | null;
          p_video_url: string | null;
          p_visibility: 'friends' | 'public';
          p_idempotency_key: string;
        };
        Returns: Post;
      };
      toggle_post_reaction: {
        Args: { p_post_id: string; p_emoji: string; p_idempotency_key: string };
        Returns: { post_id: string; emoji: string; active: boolean; count: number };
      };
      toggle_comment_like: {
        Args: { p_comment_id: string; p_idempotency_key: string };
        Returns: { comment_id: string; active: boolean; count: number };
      };
      toggle_poll_vote_like: {
        Args: { p_poll_vote_id: string; p_idempotency_key: string };
        Returns: { poll_vote_id: string; active: boolean; count: number };
      };
      request_friendship: {
        Args: { p_addressee_id: string; p_idempotency_key: string };
        Returns: Friendship;
      };
      respond_to_friendship: {
        Args: { p_friendship_id: string; p_accept: boolean; p_idempotency_key: string };
        Returns: Friendship | { id: string; status: 'declined' };
      };
      remove_friendship: {
        Args: { p_friendship_id: string; p_idempotency_key: string };
        Returns: { id: string; removed: boolean };
      };
      block_user: {
        Args: { p_blocked_user_id: string; p_idempotency_key: string };
        Returns: { id: string; blocked_user_id: string };
      };
      unblock_user: {
        Args: { p_blocked_user_id: string; p_idempotency_key: string };
        Returns: { blocked_user_id: string; blocked: false };
      };
      submit_content_report: {
        Args: {
          p_reported_user_id: string;
          p_post_id: string | null;
          p_comment_id: string | null;
          p_poll_vote_id: string | null;
          p_reason: ReportReason;
          p_idempotency_key: string;
        };
        Returns: Report;
      };
      moderate_report: {
        Args: { p_report_id: string; p_action: string; p_idempotency_key: string };
        Returns: Report;
      };
      prepare_next_daily_event: {
        Args: { p_proposed_fires_at: string; p_window_minutes: number };
        Returns: {
          daily_event_id: string;
          challenge_id: string;
          fires_at: string;
          already_prepared: boolean;
        };
      };
      submit_comment: {
        Args: {
          p_post_id: string;
          p_body: string;
          p_parent_id: string | null;
          p_idempotency_key: string;
        };
        Returns: Comment;
      };
      edit_comment: {
        Args: { p_comment_id: string; p_body: string; p_idempotency_key: string };
        Returns: Comment;
      };
      delete_comment: {
        Args: { p_comment_id: string; p_idempotency_key: string };
        Returns: { id: string; deleted: boolean };
      };
      set_post_comments_disabled: {
        Args: { p_post_id: string; p_disabled: boolean; p_idempotency_key: string };
        Returns: { id: string; comments_disabled: boolean };
      };
      sync_notification_center_state: {
        Args: {
          p_cleared_at: string | null;
          p_last_opened_at: string | null;
          p_dismissals: Record<string, string>;
        };
        Returns: NotificationCenterState;
      };
      mark_notification_center_opened: {
        Args: { p_opened_at: string };
        Returns: NotificationCenterState;
      };
      dismiss_notification: {
        Args: { p_notification_key: string; p_dismissed_at: string };
        Returns: { notification_key: string; dismissed_at: string };
      };
      clear_notification_history: {
        Args: { p_cleared_at: string };
        Returns: NotificationCenterState;
      };
      create_own_profile: {
        Args: {
          p_username: string;
          p_display_name: string;
          p_avatar_gradient: string[];
          p_timezone: string;
          p_app_theme: string;
          p_birth_date: string;
          p_bio?: string | null;
          p_avatar_url?: string | null;
        };
        Returns: Profile;
      };
      update_own_profile: {
        Args: { p_patch: Partial<Profile>; p_idempotency_key: string };
        Returns: Profile;
      };
      submit_challenge_suggestion: {
        Args: {
          p_kind: string;
          p_body: string;
          p_body_hash: string;
          p_options: unknown;
          p_idempotency_key: string;
        };
        Returns: ChallengeSuggestion;
      };
      review_challenge_suggestion: {
        Args: {
          p_suggestion_id: string;
          p_status: 'approved' | 'rejected';
          p_admin_note: string | null;
          p_idempotency_key: string;
        };
        Returns: ChallengeSuggestion & { challenge_id: string | null };
      };
    };
  };
};
