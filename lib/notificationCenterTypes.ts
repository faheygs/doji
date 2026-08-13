import type { Friendship, FriendshipWithRequester, Profile, UserEvent } from '../types/database';

type Actor = Pick<Profile, 'username' | 'display_name' | 'avatar_url' | 'equipped_border_key'>;

export type NotificationCenterItem =
  | { key: string; kind: 'friend_request'; friendship: FriendshipWithRequester; sortAt: string }
  | {
      key: string;
      kind: 'friend_accepted';
      friendship: Omit<Friendship, 'addressee'> & { addressee: Profile | null };
      sortAt: string;
    }
  | {
      key: string;
      kind: 'reactions_group';
      post_id: string;
      count: number;
      emojis: string[];
      actors: Actor[];
      sortAt: string;
    }
  | {
      key: string;
      kind: 'friend_activity_group';
      daily_event_id: string;
      count: number;
      actors: Actor[];
      sortAt: string;
    }
  | {
      key: string;
      kind: 'friend_activity_group';
      daily_event_id: string;
      count: number;
      actors: Actor[];
      sortAt: string;
    }
  | { key: string; kind: 'comment'; post_id: string; comment_id: string; actor: Actor | null; sortAt: string }
  | { key: string; kind: 'comment_like'; post_id: string; comment_id: string; actor: Actor | null; sortAt: string }
  | { key: string; kind: 'mention'; post_id: string; comment_id: string; actor: Actor | null; sortAt: string }
  | { key: string; kind: 'challenge'; userEvent: UserEvent; sortAt: string }
  | {
      key: string;
      kind: 'badge_earned';
      categoryId: string;
      categoryName: string;
      categoryEmoji: string | null;
      tier: string;
      sortAt: string;
    }
  | {
      key: string;
      kind: 'suggestion_result';
      suggestionId: string;
      body: string;
      status: 'approved' | 'rejected';
      sortAt: string;
    }
  | { key: string; kind: 'comment_reply'; post_id: string; comment_id: string; actor: Actor | null; sortAt: string }
  | { key: string; kind: 'poll_vote'; actor: Actor | null; sortAt: string };
