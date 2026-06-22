import type {
  Post,
  UserEvent,
  DailyEvent,
  Challenge,
  Profile,
  ChallengeType,
  UserEventStatus,
  Reaction,
  ReactionEmoji,
} from '../types/database';
import type { Comment } from '../types/database';
import type { NotificationCenterItem } from '../hooks/useNotificationCenter';

// Hardcoded "you" profile used on locally-created demo posts so PostCard shows the "You" pill.
// user_id is set to the real session user id at post-creation time so isOwnPost=true.
export const DEMO_YOU_PROFILE: Omit<Profile, 'id'> & { id: string } = {
  id: 'demo-you',
  username: 'demo_you',
  display_name: 'You',
  avatar_url: 'https://i.pravatar.cc/150?img=12',
  avatar_gradient: ['#6366f1', '#a855f7'] as [string, string],
  bio: null,
  current_streak: 5,
  longest_streak: 12,
  total_completions: 23,
  total_missed: 2,
  xp: 800,
  level: 3,
  reactions_received: 45,
  streak_shields: 1,
  notification_token: null,
  app_theme: 'dark',
  sparks: 620,
  accent_theme: 'default',
  appearance_mode: 'dark',
  equipped_border_key: null,
  equipped_title_key: null,
  timezone: 'America/Los_Angeles',
  is_admin: false,
  is_demo_account: true,
  onboarding_completed_at: '2024-01-01T00:00:00.000Z',
  created_at: '2024-01-01T00:00:00.000Z',
  updated_at: new Date().toISOString(),
};

// ---------------------------------------------------------------------------
// 10 fake users
// ---------------------------------------------------------------------------

function fakeProfile(
  username: string,
  displayName: string,
  gradient: [string, string],
  avatarImg: number,
): Profile {
  return {
    id: `demo-profile-${username}`,
    username,
    display_name: displayName,
    avatar_url: `https://i.pravatar.cc/150?img=${avatarImg}`,
    avatar_gradient: gradient,
    bio: null,
    current_streak: Math.floor(Math.random() * 30) + 3,
    longest_streak: Math.floor(Math.random() * 60) + 10,
    total_completions: Math.floor(Math.random() * 100) + 20,
    total_missed: Math.floor(Math.random() * 10),
    xp: Math.floor(Math.random() * 3000) + 500,
    level: Math.floor(Math.random() * 8) + 2,
    reactions_received: Math.floor(Math.random() * 200) + 30,
    streak_shields: 1,
    notification_token: null,
    app_theme: 'dark',
    sparks: Math.floor(Math.random() * 1500) + 200,
    accent_theme: 'default',
    appearance_mode: 'dark',
    equipped_border_key: null,
    equipped_title_key: null,
    timezone: 'America/Los_Angeles',
    is_admin: false,
    is_demo_account: false,
    onboarding_completed_at: '2024-01-01T00:00:00.000Z',
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: new Date().toISOString(),
  };
}

export const DEMO_USERS: Record<string, Profile> = {
  jordan_k: fakeProfile('jordan_k', 'Jordan K.', ['#FF6B35', '#F7C59F'], 1),
  alex_m: fakeProfile('alex_m', 'Alex M.', ['#4776E6', '#8E54E9'], 2),
  sam_r: fakeProfile('sam_r', 'Sam R.', ['#11998e', '#38ef7d'], 3),
  mia_t: fakeProfile('mia_t', 'Mia T.', ['#f953c6', '#b91d73'], 4),
  chris_b: fakeProfile('chris_b', 'Chris B.', ['#f7971e', '#ffd200'], 5),
  taylor_w: fakeProfile('taylor_w', 'Taylor W.', ['#56ccf2', '#2f80ed'], 6),
  morgan_l: fakeProfile('morgan_l', 'Morgan L.', ['#6a3093', '#a044ff'], 7),
  riley_p: fakeProfile('riley_p', 'Riley P.', ['#ff416c', '#ff4b2b'], 8),
  casey_h: fakeProfile('casey_h', 'Casey H.', ['#00b09b', '#96c93d'], 9),
  drew_v: fakeProfile('drew_v', 'Drew V.', ['#c94b4b', '#4b134f'], 10),
};

const USERS = Object.values(DEMO_USERS);

// ---------------------------------------------------------------------------
// Challenge definitions
// ---------------------------------------------------------------------------

export const DEMO_CHALLENGES: Record<ChallengeType, Challenge> = {
  photo: {
    id: 'demo-challenge-photo',
    title: 'Show Us Your World',
    description: "Share a photo of what you're looking at right now.",
    type: 'photo',
    emoji: '📸',
    category: 'wild',
    difficulty: 2,
    xp_reward: 25,
    participant_count: 0,
    requires_photo: true,
    requires_video: false,
    requires_text: false,
    answer_rule: null,
    is_active: false,
    is_demo: true,
    schedule_count: 0,
    created_at: '2024-01-01T00:00:00.000Z',
  },
  poll: {
    id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    title: 'Coffee or Tea?',
    description: 'Which do you prefer to start your morning?',
    type: 'poll',
    emoji: '☕',
    category: 'social',
    difficulty: 1,
    xp_reward: 25,
    participant_count: 0,
    requires_photo: false,
    requires_video: false,
    requires_text: false,
    answer_rule: null,
    is_active: false,
    is_demo: true,
    schedule_count: 0,
    created_at: '2024-01-01T00:00:00.000Z',
  },
  task: {
    id: 'demo-challenge-task',
    title: 'Describe Your Day',
    description: 'In one sentence, how would you describe today so far?',
    type: 'task',
    emoji: '📝',
    category: 'mental',
    difficulty: 1,
    xp_reward: 25,
    participant_count: 0,
    requires_photo: false,
    requires_video: false,
    requires_text: true,
    answer_rule: null,
    is_active: false,
    is_demo: true,
    schedule_count: 0,
    created_at: '2024-01-01T00:00:00.000Z',
  },
  // Displayed as "Question" in demo type selector; type='task' so task.tsx handles it
  format: {
    id: 'demo-challenge-question',
    title: 'Question of the Day',
    description: 'If you could live anywhere in the world, where would you choose and why?',
    type: 'task' as ChallengeType,
    emoji: '❓',
    category: 'mental',
    difficulty: 1,
    xp_reward: 25,
    participant_count: 0,
    requires_photo: false,
    requires_video: false,
    requires_text: true,
    answer_rule: null,
    is_active: false,
    is_demo: true,
    schedule_count: 0,
    created_at: '2024-01-01T00:00:00.000Z',
  },
};

// ---------------------------------------------------------------------------
// UserEvent factory
// ---------------------------------------------------------------------------

export function makeDemoUserEvent(
  type: ChallengeType,
  status: UserEventStatus = 'pending',
): UserEvent {
  const challenge = DEMO_CHALLENGES[type];
  const dailyEvent: DailyEvent = {
    id: `demo-daily-event-${type}`,
    challenge_id: challenge.id,
    fires_at: new Date(Date.now() - 2 * 60 * 1000).toISOString(),
    window_minutes: 999999,
    push_sent_at: null,
    created_at: new Date().toISOString(),
    challenge,
  };
  return {
    id: `demo-user-event-${type}`,
    user_id: 'demo-user',
    daily_event_id: dailyEvent.id,
    status,
    notified_at: null,
    completed_at: status === 'completed' ? new Date().toISOString() : null,
    expires_at: '2099-01-01T00:00:00.000Z',
    buy_in_at: null,
    streak_before_miss: null,
    signup_day_grace: false,
    created_at: new Date().toISOString(),
    daily_event: dailyEvent,
    challenge,
  };
}

// ---------------------------------------------------------------------------
// Helpers for building fake posts
// ---------------------------------------------------------------------------

const now = Date.now();
const MIN = 60_000;

function photoPost(
  id: string,
  username: string,
  caption: string,
  photoSeed: string,
  minutesAgo: number,
  breakdown: Record<string, number>,
): Post {
  const u = DEMO_USERS[username];
  return {
    id,
    user_event_id: null,
    user_id: u.id,
    type: 'photo',
    caption,
    photo_url: `https://picsum.photos/seed/${photoSeed}/600/600`,
    front_photo_url: null,
    video_url: null,
    is_late: false,
    selected_option_index: null,
    reaction_count: Object.values(breakdown).reduce((a, b) => a + b, 0),
    comment_count: 3,
    comments_disabled: false,
    visibility: 'friends',
    created_at: new Date(now - minutesAgo * MIN).toISOString(),
    reaction_breakdown: breakdown as any,
    my_reactions: [],
    profile: u,
    challenge: DEMO_CHALLENGES.photo,
  };
}

function pollPost(
  id: string,
  username: string,
  optionIndex: number,
  minutesAgo: number,
  breakdown: Record<string, number>,
): Post {
  const u = DEMO_USERS[username];
  return {
    id,
    user_event_id: null,
    user_id: u.id,
    type: 'poll_vote',
    caption: null,
    photo_url: null,
    front_photo_url: null,
    video_url: null,
    is_late: false,
    selected_option_index: optionIndex,
    reaction_count: Object.values(breakdown).reduce((a, b) => a + b, 0),
    comment_count: 3,
    comments_disabled: false,
    visibility: 'friends',
    created_at: new Date(now - minutesAgo * MIN).toISOString(),
    reaction_breakdown: breakdown as any,
    my_reactions: [],
    profile: u,
    challenge: DEMO_CHALLENGES.poll,
  };
}

function textPost(
  id: string,
  username: string,
  caption: string,
  challengeType: 'task' | 'format',
  minutesAgo: number,
  breakdown: Record<string, number>,
): Post {
  const u = DEMO_USERS[username];
  return {
    id,
    user_event_id: null,
    user_id: u.id,
    type: 'task_complete',
    caption,
    photo_url: null,
    front_photo_url: null,
    video_url: null,
    is_late: false,
    selected_option_index: null,
    reaction_count: Object.values(breakdown).reduce((a, b) => a + b, 0),
    comment_count: 3,
    comments_disabled: false,
    visibility: 'friends',
    created_at: new Date(now - minutesAgo * MIN).toISOString(),
    reaction_breakdown: breakdown as any,
    my_reactions: [],
    profile: u,
    challenge: DEMO_CHALLENGES[challengeType],
  };
}

// ---------------------------------------------------------------------------
// Feed posts per challenge type
// ---------------------------------------------------------------------------

export const DEMO_FEED_POSTS_BY_TYPE: Record<ChallengeType, Post[]> = {
  photo: [
    photoPost('demo-photo-1', 'jordan_k', 'My morning setup — finally got the lighting right', 'doji-photo-1', 22, { fire: 14, heart: 9, wow: 3 }),
    photoPost('demo-photo-2', 'alex_m', 'Coffee + notebook, the only way to start', 'doji-photo-2', 18, { heart: 12, like: 7, fire: 5 }),
    photoPost('demo-photo-3', 'sam_r', 'Desk view today — chaotic but functional 😅', 'doji-photo-3', 14, { laugh: 18, fire: 6, wow: 4 }),
    photoPost('demo-photo-4', 'mia_t', 'Caught the sunrise on the way in. Worth waking up for', 'doji-photo-4', 9, { wow: 22, heart: 11, fire: 8 }),
    photoPost('demo-photo-5', 'chris_b', "Backyard this morning — neighbor's cat crashed the shot", 'doji-photo-5', 5, { laugh: 19, heart: 8, like: 4 }),
  ],
  poll: [
    pollPost('demo-poll-1', 'taylor_w', 0, 20, { fire: 22, like: 8 }),
    pollPost('demo-poll-2', 'morgan_l', 1, 16, { heart: 15, like: 9, fire: 3 }),
    pollPost('demo-poll-3', 'riley_p', 0, 12, { fire: 11, wow: 6, like: 4 }),
    pollPost('demo-poll-4', 'casey_h', 1, 7, { heart: 13, fire: 7 }),
    pollPost('demo-poll-5', 'drew_v', 0, 3, { like: 16, fire: 9, wow: 2 }),
  ],
  task: [
    textPost('demo-task-1', 'jordan_k', 'Productive chaos. Three meetings, one good idea, two cold coffees. Somehow still smiling.', 'task', 21, { heart: 11, like: 7, fire: 4 }),
    textPost('demo-task-2', 'alex_m', 'Quiet. The good kind — windows open, to-do list shrinking, no notifications until noon.', 'task', 17, { heart: 18, wow: 5, like: 6 }),
    textPost('demo-task-3', 'sam_r', 'A slow start that turned into something. By lunch I had momentum. By dinner, done.', 'task', 12, { fire: 13, like: 9, heart: 4 }),
    textPost('demo-task-4', 'mia_t', 'Unexpectedly good. Someone brought donuts. The rest is history.', 'task', 7, { laugh: 24, heart: 10, fire: 5 }),
    textPost('demo-task-5', 'chris_b', "One step forward, two steps sideways. But I'm still moving.", 'task', 2, { heart: 16, wow: 7, fire: 3 }),
  ],
  format: [
    textPost('demo-q-1', 'taylor_w', "Tokyo. The energy, the food, the trains that are actually on time. No contest.", 'format', 20, { wow: 19, fire: 8, like: 5 }),
    textPost('demo-q-2', 'morgan_l', 'Somewhere in the Swiss Alps. Slow mornings, mountain views, and extremely good cheese.', 'format', 15, { heart: 17, wow: 12, fire: 6 }),
    textPost('demo-q-3', 'riley_p', 'Right where I am, honestly. But maybe with better weather.', 'format', 10, { laugh: 21, heart: 9, like: 7 }),
    textPost('demo-q-4', 'casey_h', "Cape Town — oceans, mountains, and the best sunsets I've ever seen in a photo.", 'format', 6, { wow: 14, fire: 11, heart: 8 }),
    textPost('demo-q-5', 'drew_v', "New Zealand. Hobbiton, fjords, the fact that it's basically Middle-earth. Easy.", 'format', 2, { laugh: 13, wow: 10, fire: 7 }),
  ],
};

// ---------------------------------------------------------------------------
// Demo comments (3 per post, across all types)
// ---------------------------------------------------------------------------

const ALL_POST_IDS = [
  ...DEMO_FEED_POSTS_BY_TYPE.photo.map((p) => p.id),
  ...DEMO_FEED_POSTS_BY_TYPE.poll.map((p) => p.id),
  ...DEMO_FEED_POSTS_BY_TYPE.task.map((p) => p.id),
  ...DEMO_FEED_POSTS_BY_TYPE.format.map((p) => p.id),
];

const COMMENT_POOL = [
  "This is exactly my vibe right now 🙌",
  "okay this is the content I'm here for",
  "haha same same same",
  "fire 🔥",
  "love this so much",
  "this made me smile, thank you",
  "you always nail it",
  "I needed this today",
  "lol literally me",
  "okay but WHY is this so accurate",
  "bestie behavior",
  "sending this to everyone I know",
  "the accuracy is unreal",
  "this is giving main character energy",
  "okay I laughed out loud at this",
  "big mood",
  "underrated response tbh",
  "stop being so relatable",
  "I felt this in my bones",
  "no notes, this is perfect",
];

function makeComments(postId: string, commentorUsernames: string[]): Comment[] {
  const t = Date.parse(
    (DEMO_FEED_POSTS_BY_TYPE.photo.find((p) => p.id === postId) ??
      DEMO_FEED_POSTS_BY_TYPE.poll.find((p) => p.id === postId) ??
      DEMO_FEED_POSTS_BY_TYPE.task.find((p) => p.id === postId) ??
      DEMO_FEED_POSTS_BY_TYPE.format.find((p) => p.id === postId))?.created_at ?? new Date().toISOString()
  );
  return commentorUsernames.map((username, i) => ({
    id: `demo-comment-${postId}-${i}`,
    post_id: postId,
    user_id: DEMO_USERS[username]?.id ?? `demo-profile-${username}`,
    parent_id: null,
    body: COMMENT_POOL[(postId.charCodeAt(postId.length - 1) + i * 7) % COMMENT_POOL.length],
    like_count: Math.floor(Math.random() * 8),
    created_at: new Date(t + (i + 1) * 3 * 60_000).toISOString(),
    updated_at: null,
    body_edited: false,
    my_like: false,
    profile: DEMO_USERS[username],
  }));
}

const COMMENT_ASSIGNEES = [
  ['alex_m', 'sam_r', 'mia_t'],
  ['chris_b', 'taylor_w', 'morgan_l'],
  ['riley_p', 'casey_h', 'drew_v'],
  ['jordan_k', 'morgan_l', 'riley_p'],
  ['taylor_w', 'drew_v', 'alex_m'],
];

export const DEMO_COMMENTS_BY_POST: Record<string, Comment[]> = {};
ALL_POST_IDS.forEach((id, idx) => {
  DEMO_COMMENTS_BY_POST[id] = makeComments(id, COMMENT_ASSIGNEES[idx % COMMENT_ASSIGNEES.length]);
});

// ---------------------------------------------------------------------------
// Demo reactions (per post, full list for reaction viewer)
// ---------------------------------------------------------------------------

const EMOJI_POOL: ReactionEmoji[] = ['fire', 'heart', 'wow', 'like', 'laugh'];

function makeReactions(postId: string, usernames: string[]): Reaction[] {
  return usernames.map((username, i) => ({
    id: `demo-reaction-${postId}-${i}`,
    post_id: postId,
    user_id: DEMO_USERS[username]?.id ?? `demo-profile-${username}`,
    emoji: EMOJI_POOL[(postId.charCodeAt(postId.length - 1) + i * 3) % EMOJI_POOL.length],
    created_at: new Date(now - (30 - i * 3) * MIN).toISOString(),
    profile: DEMO_USERS[username],
  }));
}

const REACTOR_SETS = [
  ['alex_m', 'sam_r', 'mia_t', 'chris_b', 'taylor_w', 'morgan_l'],
  ['riley_p', 'casey_h', 'drew_v', 'jordan_k', 'alex_m', 'mia_t'],
  ['taylor_w', 'morgan_l', 'riley_p', 'casey_h', 'sam_r', 'drew_v'],
  ['jordan_k', 'chris_b', 'taylor_w', 'riley_p', 'morgan_l', 'alex_m'],
  ['drew_v', 'casey_h', 'mia_t', 'sam_r', 'chris_b', 'jordan_k'],
];

export const DEMO_REACTIONS_BY_POST: Record<string, Reaction[]> = {};
ALL_POST_IDS.forEach((id, idx) => {
  DEMO_REACTIONS_BY_POST[id] = makeReactions(id, REACTOR_SETS[idx % REACTOR_SETS.length]);
});

// ---------------------------------------------------------------------------
// Demo notifications
// ---------------------------------------------------------------------------

const recentAgo = (mins: number) => new Date(now - mins * MIN).toISOString();

export const DEMO_NOTIFICATIONS: NotificationCenterItem[] = [
  {
    key: 'demo-notif-reaction-1',
    kind: 'reactions_group',
    post_id: 'demo-photo-1',
    count: 8,
    emojis: ['fire', 'heart', 'wow'],
    actors: [DEMO_USERS.alex_m, DEMO_USERS.sam_r, DEMO_USERS.mia_t],
    sortAt: recentAgo(5),
  },
  {
    key: 'demo-notif-comment-1',
    kind: 'comment',
    post_id: 'demo-photo-1',
    comment_id: 'demo-comment-demo-photo-1-0',
    actor: DEMO_USERS.alex_m,
    sortAt: recentAgo(12),
  },
  {
    key: 'demo-notif-reply-1',
    kind: 'comment_reply',
    post_id: 'demo-task-1',
    comment_id: 'demo-comment-demo-task-1-1',
    actor: DEMO_USERS.chris_b,
    sortAt: recentAgo(18),
  },
  {
    key: 'demo-notif-poll-1',
    kind: 'poll_vote',
    actor: DEMO_USERS.taylor_w,
    sortAt: recentAgo(25),
  },
  {
    key: 'demo-notif-badge-1',
    kind: 'badge_earned',
    categoryId: 'social',
    categoryName: 'Social Butterfly',
    categoryEmoji: '🦋',
    tier: 'silver',
    sortAt: recentAgo(45),
  },
  {
    key: 'demo-notif-reaction-2',
    kind: 'reactions_group',
    post_id: 'demo-task-2',
    count: 5,
    emojis: ['heart', 'like'],
    actors: [DEMO_USERS.morgan_l, DEMO_USERS.riley_p],
    sortAt: recentAgo(60),
  },
  {
    key: 'demo-notif-comment-2',
    kind: 'comment',
    post_id: 'demo-photo-2',
    comment_id: 'demo-comment-demo-photo-2-0',
    actor: DEMO_USERS.drew_v,
    sortAt: recentAgo(90),
  },
  {
    key: 'demo-notif-badge-2',
    kind: 'badge_earned',
    categoryId: 'physical',
    categoryName: 'On the Move',
    categoryEmoji: '🏃',
    tier: 'bronze',
    sortAt: recentAgo(120),
  },
];
