import type { ThemeName } from '../constants/theme';

export type ReactionEmoji = 'fire' | 'like' | 'dislike' | 'laugh' | 'wow' | 'love';

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
  /** Color theme (`ThemeName`); stored in DB, default `midnight`. */
  app_theme: ThemeName;
  timezone: string;
  created_at: string;
  updated_at: string;
};

export type ChallengeType = 'photo' | 'poll' | 'task';

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
  created_at: string;
};

export type PollVote = {
  id: string;
  user_id: string;
  challenge_id: string;
  option_id: string;
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

export type UserEventStatus = 'pending' | 'completed' | 'missed' | 'late';

export type UserEvent = {
  id: string;
  user_id: string;
  daily_event_id: string;
  status: UserEventStatus;
  notified_at: string | null;
  completed_at: string | null;
  expires_at: string;
  created_at: string;
  daily_event?: DailyEvent;
  challenge?: Challenge;
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
  visibility: 'friends' | 'public';
  created_at: string;
  reaction_breakdown?: Record<ReactionEmoji, number>;
  my_reactions?: ReactionEmoji[];
  profile?: Profile;
  challenge?: Challenge;
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
        Row: {
          id: string;
          user_id: string;
          kind: string;
          body: string;
          body_hash: string;
          options: unknown;
          admin_note: string | null;
          selected_at: string | null;
          created_at: string;
        };
        Insert: {
          user_id: string;
          kind: string;
          body: string;
          body_hash: string;
          options?: unknown;
        };
        Update: Partial<{
          admin_note: string | null;
          selected_at: string | null;
        }>;
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
        Insert: Omit<Comment, 'id' | 'created_at' | 'like_count' | 'my_like'>;
        Update: Partial<Comment>;
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
      weekly_xp: {
        Row: WeeklyXp;
        Insert: WeeklyXp;
        Update: Partial<WeeklyXp>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      friend_count: {
        Args: { p_user_id: string };
        Returns: number;
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
    };
  };
};
