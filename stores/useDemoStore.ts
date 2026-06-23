import { create } from 'zustand';
import type { ChallengeType, UserEventStatus, Post, Profile, ReactionEmoji, Comment } from '../types/database';
import {
  DEMO_FEED_POSTS_BY_TYPE,
  DEMO_ME_PROFILE,
  DEMO_USERS,
  DEMO_INITIAL_FRIEND_USERNAMES,
  DEMO_INITIAL_PENDING_RECEIVED_USERNAMES,
} from '../constants/demoData';
import { useAuthStore } from './useAuthStore';

interface DemoState {
  isDemoMode: boolean;
  demoChallengeType: ChallengeType;
  demoStatus: UserEventStatus;
  demoFeedPosts: Post[];
  demoFeedVersion: number;
  demoCompletedTypes: Partial<Record<ChallengeType, boolean>>;
  demoVotesByChallenge: Record<string, string>;
  _savedProfile: Profile | null;
  // User's own interactions (persisted across navigations within demo session)
  demoMyReactionByPost: Record<string, ReactionEmoji | null>;   // null = reacted then removed
  demoMyCommentsByPost: Record<string, Comment[]>;
  demoLikedCommentIds: string[];
  // Friends (local-only in demo mode)
  demoFriendIds: string[];
  demoPendingSentIds: string[];
  demoPendingReceivedIds: string[];
  // Actions
  enterDemoMode: (type?: ChallengeType) => void;
  exitDemoMode: () => void;
  setDemoChallengeType: (type: ChallengeType) => void;
  completeDemoChallenge: () => void;
  addDemoPost: (post: Post) => void;
  addDemoVote: (challengeId: string, optionId: string) => void;
  setDemoMyReaction: (postId: string, emoji: ReactionEmoji | null) => void;
  addDemoMyComment: (postId: string, comment: Comment) => void;
  editDemoMyComment: (postId: string, commentId: string, body: string) => void;
  deleteDemoMyComment: (postId: string, commentId: string) => void;
  toggleDemoCommentLike: (commentId: string) => void;
  sendDemoFriendRequest: (userId: string) => void;
  acceptDemoFriendRequest: (userId: string) => void;
  declineDemoFriendRequest: (userId: string) => void;
  removeDemoFriend: (userId: string) => void;
}

const EMPTY_INTERACTIONS = {
  demoMyReactionByPost: {} as Record<string, ReactionEmoji | null>,
  demoMyCommentsByPost: {} as Record<string, Comment[]>,
  demoLikedCommentIds: [] as string[],
};

const EMPTY_FRIENDS = {
  demoFriendIds: [] as string[],
  demoPendingSentIds: [] as string[],
  demoPendingReceivedIds: [] as string[],
};

const INITIAL_FRIENDS = {
  demoFriendIds: DEMO_INITIAL_FRIEND_USERNAMES.map((u) => DEMO_USERS[u].id),
  demoPendingSentIds: [] as string[],
  demoPendingReceivedIds: DEMO_INITIAL_PENDING_RECEIVED_USERNAMES.map((u) => DEMO_USERS[u].id),
};

export const useDemoStore = create<DemoState>((set, get) => ({
  isDemoMode: false,
  demoChallengeType: 'photo',
  demoStatus: 'pending',
  demoFeedPosts: DEMO_FEED_POSTS_BY_TYPE.photo,
  demoFeedVersion: 0,
  demoCompletedTypes: {},
  demoVotesByChallenge: {},
  _savedProfile: null,
  ...EMPTY_INTERACTIONS,
  ...EMPTY_FRIENDS,

  enterDemoMode: (type = 'photo') => {
    const authState = useAuthStore.getState();
    const savedProfile = authState.profile;
    const realUserId = savedProfile?.id ?? authState.session?.user?.id;
    useAuthStore.setState({ profile: { ...DEMO_ME_PROFILE, id: realUserId ?? DEMO_ME_PROFILE.id } as Profile });
    set({
      isDemoMode: true,
      demoChallengeType: type,
      demoStatus: 'pending',
      demoFeedPosts: DEMO_FEED_POSTS_BY_TYPE[type],
      demoFeedVersion: 1,
      demoCompletedTypes: {},
      demoVotesByChallenge: {},
      _savedProfile: savedProfile,
      ...EMPTY_INTERACTIONS,
      ...INITIAL_FRIENDS,
    });
  },

  exitDemoMode: () => {
    const saved = get()._savedProfile;
    if (saved !== null) {
      useAuthStore.setState({ profile: saved });
    }
    set({
      isDemoMode: false,
      demoChallengeType: 'photo',
      demoStatus: 'pending',
      demoFeedPosts: DEMO_FEED_POSTS_BY_TYPE.photo,
      demoFeedVersion: 0,
      demoCompletedTypes: {},
      demoVotesByChallenge: {},
      _savedProfile: null,
      ...EMPTY_INTERACTIONS,
      ...EMPTY_FRIENDS,
    });
  },

  setDemoChallengeType: (type) =>
    set((s) => ({
      demoChallengeType: type,
      demoStatus: s.demoCompletedTypes[type] ? 'completed' : 'pending',
      demoFeedPosts: DEMO_FEED_POSTS_BY_TYPE[type],
      demoFeedVersion: s.demoFeedVersion + 1,
    })),

  completeDemoChallenge: () =>
    set((s) => ({
      demoStatus: 'completed',
      demoCompletedTypes: { ...s.demoCompletedTypes, [s.demoChallengeType]: true },
    })),

  addDemoPost: (post) =>
    set((s) => ({
      demoFeedPosts: [post, ...s.demoFeedPosts],
      demoFeedVersion: s.demoFeedVersion + 1,
    })),

  addDemoVote: (challengeId, optionId) =>
    set((s) => ({
      demoVotesByChallenge: { ...s.demoVotesByChallenge, [challengeId]: optionId },
    })),

  setDemoMyReaction: (postId, emoji) =>
    set((s) => ({
      demoMyReactionByPost: { ...s.demoMyReactionByPost, [postId]: emoji },
    })),

  addDemoMyComment: (postId, comment) =>
    set((s) => ({
      demoMyCommentsByPost: {
        ...s.demoMyCommentsByPost,
        [postId]: [...(s.demoMyCommentsByPost[postId] ?? []), comment],
      },
    })),

  editDemoMyComment: (postId, commentId, body) =>
    set((s) => ({
      demoMyCommentsByPost: {
        ...s.demoMyCommentsByPost,
        [postId]: (s.demoMyCommentsByPost[postId] ?? []).map((c) =>
          c.id === commentId ? { ...c, body, body_edited: true } : c,
        ),
      },
    })),

  deleteDemoMyComment: (postId, commentId) =>
    set((s) => ({
      demoMyCommentsByPost: {
        ...s.demoMyCommentsByPost,
        [postId]: (s.demoMyCommentsByPost[postId] ?? []).filter((c) => c.id !== commentId),
      },
    })),

  toggleDemoCommentLike: (commentId) =>
    set((s) => ({
      demoLikedCommentIds: s.demoLikedCommentIds.includes(commentId)
        ? s.demoLikedCommentIds.filter((id) => id !== commentId)
        : [...s.demoLikedCommentIds, commentId],
    })),

  sendDemoFriendRequest: (userId) =>
    set((s) => ({
      demoPendingSentIds: s.demoPendingSentIds.includes(userId)
        ? s.demoPendingSentIds
        : [...s.demoPendingSentIds, userId],
    })),

  acceptDemoFriendRequest: (userId) =>
    set((s) => ({
      demoFriendIds: s.demoFriendIds.includes(userId)
        ? s.demoFriendIds
        : [...s.demoFriendIds, userId],
      demoPendingReceivedIds: s.demoPendingReceivedIds.filter((id) => id !== userId),
    })),

  declineDemoFriendRequest: (userId) =>
    set((s) => ({
      demoPendingReceivedIds: s.demoPendingReceivedIds.filter((id) => id !== userId),
    })),

  removeDemoFriend: (userId) =>
    set((s) => ({
      demoFriendIds: s.demoFriendIds.filter((id) => id !== userId),
      demoPendingSentIds: s.demoPendingSentIds.filter((id) => id !== userId),
    })),
}));
