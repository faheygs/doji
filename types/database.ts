import type { ThemeName } from '../constants/theme';

export type ReactionEmoji = 'fire' | 'like' | 'dislike' | 'laugh' | 'wow' | 'heart';

/** Stored on profiles.notification_preferences (jsonb). */
export type NotificationPreferences = {
  push_enabled: boolean;
  /** Show numeric unread badge on the home bell icon. */
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
  poll_vote: boolean;
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
  onboarding_completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ChallengeType = 'photo' | 'poll' | 'task' | 'format';

export type AnswerRuleType = 'starts_with_letter' | 'exact_word_count';

export type AnswerRule =
  | { type: 'starts_with_letter'; letter: string }
  | { type: 'exact_word_count'; count: number };

export type Challenge = {
  id: string;
  title: string;
  description: string;
  type: ChallengeType;
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
  /** Times this challenge has been assigned to a daily_event; scheduler prefers lower values. */
  schedule_count: number;
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
  custom_text?: string | null;
  created_at: string;
};

export type DailyEvent = {
  id: string;
  challenge_id: string;
  fires_at: string;
  window_minutes: number;
  push_sent_at: string | null;
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
  | 'friend_accept';

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
  visibility: 'friends' | 'public';
  created_at: string;
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
};

export type Comment = {
  id: string;
  post_id: string;
  user_id: string;
  parent_id: string | null;
  body: string;
  like_count: number;
  created_at: string;
  updated_at: string | null;
  body_edited: boolean;
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

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: Omit<Profile, 'created_at' | 'updated_at'>;
        Update: Partial<Profile>;
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
    };
  };
};
