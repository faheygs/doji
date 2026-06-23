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
  PollOption,
} from '../types/database';
import type { Comment } from '../types/database';
import type { NotificationCenterItem } from '../hooks/useNotificationCenter';

// ---------------------------------------------------------------------------
// Fake "logged-in" user shown in demo mode — replaces the real profile
// ID is overwritten with the real session user ID at runtime in useDemoStore
// ---------------------------------------------------------------------------

export const DEMO_ME_PROFILE: Profile = {
  id: 'demo-me',
  username: 'demo_me',
  display_name: 'You',
  avatar_url: 'https://i.pravatar.cc/150?img=33',
  avatar_gradient: ['#6366f1', '#a855f7'] as [string, string],
  bio: 'Just here to test the app 👀',
  current_streak: 14,
  longest_streak: 31,
  total_completions: 48,
  total_missed: 3,
  xp: 1240,
  level: 4,
  reactions_received: 92,
  streak_shields: 2,
  notification_token: null,
  app_theme: 'dark',
  sparks: 840,
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
// 30 fake users
// ---------------------------------------------------------------------------

function fakeProfile(
  username: string,
  displayName: string,
  gradient: [string, string],
  avatarImg: number,
  streak: number,
  sparks: number,
  level: number,
): Profile {
  return {
    id: `demo-profile-${username}`,
    username,
    display_name: displayName,
    avatar_url: `https://i.pravatar.cc/150?img=${avatarImg}`,
    avatar_gradient: gradient,
    bio: null,
    current_streak: streak,
    longest_streak: streak + Math.floor(streak * 0.8),
    total_completions: streak * 3 + 10,
    total_missed: Math.floor(streak * 0.1),
    xp: level * 300 + sparks,
    level,
    reactions_received: sparks % 200 + 20,
    streak_shields: level > 4 ? 2 : 1,
    notification_token: null,
    app_theme: 'dark',
    sparks,
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
  jordan_k:  fakeProfile('jordan_k',  'Jordan K.',   ['#FF6B35', '#F7C59F'], 1,  21, 1240, 5),
  alex_m:    fakeProfile('alex_m',    'Alex M.',     ['#4776E6', '#8E54E9'], 2,  9,  580,  3),
  sam_r:     fakeProfile('sam_r',     'Sam R.',      ['#11998e', '#38ef7d'], 3,  34, 2100, 7),
  mia_t:     fakeProfile('mia_t',     'Mia T.',      ['#f953c6', '#b91d73'], 4,  6,  390,  2),
  chris_b:   fakeProfile('chris_b',   'Chris B.',    ['#f7971e', '#ffd200'], 5,  18, 1050, 4),
  taylor_w:  fakeProfile('taylor_w',  'Taylor W.',   ['#56ccf2', '#2f80ed'], 6,  42, 2800, 8),
  morgan_l:  fakeProfile('morgan_l',  'Morgan L.',   ['#6a3093', '#a044ff'], 7,  11, 700,  3),
  riley_p:   fakeProfile('riley_p',   'Riley P.',    ['#ff416c', '#ff4b2b'], 8,  5,  310,  2),
  casey_h:   fakeProfile('casey_h',   'Casey H.',    ['#00b09b', '#96c93d'], 9,  27, 1680, 6),
  drew_v:    fakeProfile('drew_v',    'Drew V.',     ['#c94b4b', '#4b134f'], 10, 3,  210,  1),
  avery_n:   fakeProfile('avery_n',   'Avery N.',    ['#E96D71', '#FF8C42'], 11, 15, 920,  4),
  jamie_k:   fakeProfile('jamie_k',   'Jamie K.',    ['#2C3E50', '#4CA1AF'], 12, 58, 3400, 9),
  blake_s:   fakeProfile('blake_s',   'Blake S.',    ['#43B89C', '#38A169'], 13, 7,  450,  2),
  quinn_f:   fakeProfile('quinn_f',   'Quinn F.',    ['#F6D365', '#FDA085'], 14, 23, 1420, 5),
  reese_d:   fakeProfile('reese_d',   'Reese D.',    ['#1A2980', '#26D0CE'], 15, 12, 750,  3),
  skyler_g:  fakeProfile('skyler_g',  'Skyler G.',   ['#4ECDC4', '#44A08D'], 16, 30, 1900, 6),
  dakota_r:  fakeProfile('dakota_r',  'Dakota R.',   ['#E44D26', '#F16529'], 17, 4,  260,  1),
  finley_c:  fakeProfile('finley_c',  'Finley C.',   ['#1D4350', '#A43931'], 18, 19, 1140, 4),
  hayden_m:  fakeProfile('hayden_m',  'Hayden M.',   ['#544A7D', '#FFE29A'], 19, 8,  510,  2),
  kendall_b: fakeProfile('kendall_b', 'Kendall B.',  ['#C94B4B', '#F15F79'], 20, 47, 2950, 8),
  logan_w:   fakeProfile('logan_w',   'Logan W.',    ['#6A85B6', '#BAC8E0'], 21, 14, 870,  3),
  madison_j: fakeProfile('madison_j', 'Madison J.',  ['#FDB99B', '#CF8BF3'], 22, 36, 2200, 7),
  peyton_a:  fakeProfile('peyton_a',  'Peyton A.',   ['#7028E4', '#E5B2CA'], 23, 2,  150,  1),
  rowan_e:   fakeProfile('rowan_e',   'Rowan E.',    ['#16A085', '#F4D03F'], 24, 25, 1560, 5),
  sawyer_t:  fakeProfile('sawyer_t',  'Sawyer T.',   ['#1ABC9C', '#2C3E50'], 25, 10, 640,  3),
  sterling_f:fakeProfile('sterling_f','Sterling F.', ['#8E44AD', '#C39BD3'], 26, 16, 980,  4),
  tatum_h:   fakeProfile('tatum_h',   'Tatum H.',    ['#E67E22', '#F39C12'], 27, 53, 3200, 9),
  river_n:   fakeProfile('river_n',   'River N.',    ['#2ECC71', '#1ABC9C'], 28, 6,  400,  2),
  emerson_c: fakeProfile('emerson_c', 'Emerson C.',  ['#E74C3C', '#C0392B'], 29, 39, 2450, 7),
  remy_v:    fakeProfile('remy_v',    'Remy V.',     ['#2C2C2C', '#767676'], 30, 1,  100,  1),
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
  // WYR (Would You Rather) — poll-type with 2 options, shows community result card
  format: {
    id: 'demo-challenge-wyr',
    title: 'Would You Rather...?',
    description: 'Would you rather always be overdressed or always be underdressed?',
    type: 'poll' as ChallengeType,
    emoji: '🤔',
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

// Explicit reactions per post: [username, emoji]
// These are the single source of truth — post breakdowns AND DEMO_REACTIONS_BY_POST
// are both derived from here so counts always match what you see in the viewer.
const REACTION_DEFS: Record<string, Array<[string, ReactionEmoji]>> = {
  'demo-photo-1': [
    ['alex_m', 'fire'], ['sam_r', 'fire'], ['mia_t', 'fire'], ['taylor_w', 'fire'], ['avery_n', 'fire'],
    ['chris_b', 'heart'], ['morgan_l', 'heart'], ['casey_h', 'heart'], ['jamie_k', 'heart'],
    ['riley_p', 'wow'], ['drew_v', 'wow'],
  ],
  'demo-photo-2': [
    ['jordan_k', 'heart'], ['sam_r', 'heart'], ['mia_t', 'heart'], ['taylor_w', 'heart'],
    ['chris_b', 'like'], ['morgan_l', 'like'], ['riley_p', 'like'],
    ['casey_h', 'fire'], ['drew_v', 'fire'],
  ],
  'demo-photo-3': [
    ['alex_m', 'laugh'], ['mia_t', 'laugh'], ['chris_b', 'laugh'],
    ['taylor_w', 'laugh'], ['morgan_l', 'laugh'], ['riley_p', 'laugh'],
    ['casey_h', 'fire'], ['drew_v', 'fire'], ['avery_n', 'fire'],
    ['jamie_k', 'wow'], ['blake_s', 'wow'],
  ],
  'demo-photo-4': [
    ['jordan_k', 'wow'], ['alex_m', 'wow'], ['sam_r', 'wow'], ['taylor_w', 'wow'], ['morgan_l', 'wow'],
    ['chris_b', 'heart'], ['riley_p', 'heart'], ['casey_h', 'heart'], ['drew_v', 'heart'],
    ['avery_n', 'fire'], ['quinn_f', 'fire'], ['reese_d', 'fire'],
  ],
  'demo-photo-5': [
    ['jordan_k', 'laugh'], ['alex_m', 'laugh'], ['sam_r', 'laugh'], ['mia_t', 'laugh'], ['taylor_w', 'laugh'],
    ['morgan_l', 'heart'], ['riley_p', 'heart'], ['casey_h', 'heart'],
    ['drew_v', 'like'], ['avery_n', 'like'],
  ],
  'demo-task-1': [
    ['sam_r', 'heart'], ['mia_t', 'heart'], ['taylor_w', 'heart'], ['skyler_g', 'heart'],
    ['chris_b', 'like'], ['morgan_l', 'like'], ['hayden_m', 'like'],
    ['riley_p', 'fire'], ['kendall_b', 'fire'],
  ],
  'demo-task-2': [
    ['jordan_k', 'heart'], ['sam_r', 'heart'], ['chris_b', 'heart'], ['morgan_l', 'heart'], ['madison_j', 'heart'],
    ['mia_t', 'wow'], ['taylor_w', 'wow'], ['peyton_a', 'wow'],
    ['riley_p', 'like'], ['rowan_e', 'like'],
  ],
  'demo-task-3': [
    ['jordan_k', 'fire'], ['alex_m', 'fire'], ['mia_t', 'fire'], ['sterling_f', 'fire'],
    ['chris_b', 'like'], ['taylor_w', 'like'], ['tatum_h', 'like'],
    ['morgan_l', 'heart'], ['river_n', 'heart'],
  ],
  'demo-task-4': [
    ['jordan_k', 'laugh'], ['alex_m', 'laugh'], ['sam_r', 'laugh'],
    ['chris_b', 'laugh'], ['emerson_c', 'laugh'], ['remy_v', 'laugh'],
    ['taylor_w', 'heart'], ['morgan_l', 'heart'], ['riley_p', 'heart'],
    ['casey_h', 'fire'], ['drew_v', 'fire'],
  ],
  'demo-task-5': [
    ['jordan_k', 'heart'], ['sam_r', 'heart'], ['mia_t', 'heart'], ['finley_c', 'heart'],
    ['alex_m', 'wow'], ['taylor_w', 'wow'], ['dakota_r', 'wow'],
    ['morgan_l', 'fire'], ['blake_s', 'fire'],
  ],
  'demo-community-poll': [],
  'demo-community-wyr': [],
};

function buildBreakdown(defs: Array<[string, ReactionEmoji]>): Record<string, number> {
  const bd: Record<string, number> = {};
  for (const [, emoji] of defs) bd[emoji] = (bd[emoji] ?? 0) + 1;
  return bd;
}

function photoPost(
  id: string,
  username: string,
  caption: string,
  photoSeed: string,
  minutesAgo: number,
): Post {
  const u = DEMO_USERS[username];
  const defs = REACTION_DEFS[id] ?? [];
  const breakdown = buildBreakdown(defs);
  return {
    id,
    user_event_id: null,
    user_id: u.id,
    type: 'photo',
    caption,
    photo_url: `https://picsum.photos/${photoSeed}/600/600`,
    front_photo_url: null,
    video_url: null,
    is_late: false,
    selected_option_index: null,
    reaction_count: defs.length,
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

function textPost(
  id: string,
  username: string,
  caption: string,
  challengeType: 'task' | 'format',
  minutesAgo: number,
): Post {
  const u = DEMO_USERS[username];
  const defs = REACTION_DEFS[id] ?? [];
  const breakdown = buildBreakdown(defs);
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
    reaction_count: defs.length,
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
// Poll options — hardcoded for demo (PollResultCard reads these in demo mode)
// ---------------------------------------------------------------------------

export type DemoPollOptionRow = PollOption & {
  liveCount: number;
  voters: Array<{ user_id: string; username: string; display_name: string | null; avatar_url: string | null; equipped_border_key: string | null }>;
};

function voter(u: Profile) {
  return { user_id: u.id, username: u.username, display_name: u.display_name, avatar_url: u.avatar_url, equipped_border_key: null };
}

export const DEMO_POLL_OPTIONS: DemoPollOptionRow[] = [
  {
    id: 'demo-opt-0', challenge_id: DEMO_CHALLENGES.poll.id, text: 'Coffee', position: 0,
    is_other: false, created_at: '2024-01-01T00:00:00Z',
    voters: [
      voter(DEMO_USERS.jordan_k), voter(DEMO_USERS.alex_m),    voter(DEMO_USERS.sam_r),
      voter(DEMO_USERS.mia_t),    voter(DEMO_USERS.chris_b),   voter(DEMO_USERS.avery_n),
      voter(DEMO_USERS.quinn_f),  voter(DEMO_USERS.kendall_b), voter(DEMO_USERS.tatum_h),
      voter(DEMO_USERS.finley_c), voter(DEMO_USERS.madison_j), voter(DEMO_USERS.emerson_c),
      voter(DEMO_USERS.remy_v),
    ],
    get vote_count() { return this.voters.length; },
    get liveCount()  { return this.voters.length; },
  },
  {
    id: 'demo-opt-1', challenge_id: DEMO_CHALLENGES.poll.id, text: 'Tea', position: 1,
    is_other: false, created_at: '2024-01-01T00:00:00Z',
    voters: [
      voter(DEMO_USERS.taylor_w), voter(DEMO_USERS.morgan_l), voter(DEMO_USERS.riley_p),
      voter(DEMO_USERS.jamie_k),  voter(DEMO_USERS.skyler_g), voter(DEMO_USERS.sterling_f),
      voter(DEMO_USERS.river_n),  voter(DEMO_USERS.dakota_r),
    ],
    get vote_count() { return this.voters.length; },
    get liveCount()  { return this.voters.length; },
  },
  {
    id: 'demo-opt-2', challenge_id: DEMO_CHALLENGES.poll.id, text: 'Both equally', position: 2,
    is_other: false, created_at: '2024-01-01T00:00:00Z',
    voters: [
      voter(DEMO_USERS.casey_h), voter(DEMO_USERS.blake_s),
      voter(DEMO_USERS.rowan_e), voter(DEMO_USERS.hayden_m),
    ],
    get vote_count() { return this.voters.length; },
    get liveCount()  { return this.voters.length; },
  },
  {
    id: 'demo-opt-3', challenge_id: DEMO_CHALLENGES.poll.id, text: 'Neither', position: 3,
    is_other: false, created_at: '2024-01-01T00:00:00Z',
    voters: [
      voter(DEMO_USERS.drew_v),   voter(DEMO_USERS.reese_d), voter(DEMO_USERS.peyton_a),
      voter(DEMO_USERS.sawyer_t), voter(DEMO_USERS.logan_w),
    ],
    get vote_count() { return this.voters.length; },
    get liveCount()  { return this.voters.length; },
  },
];

export const DEMO_POLL_TOTAL_VOTES = DEMO_POLL_OPTIONS.reduce((s, o) => s + o.liveCount, 0);

// WYR options (2 choices)
export const DEMO_WYR_OPTIONS: DemoPollOptionRow[] = [
  {
    id: 'demo-wyr-opt-0', challenge_id: DEMO_CHALLENGES.format.id, text: 'Always overdressed', position: 0,
    is_other: false, created_at: '2024-01-01T00:00:00Z',
    voters: [
      voter(DEMO_USERS.jordan_k),  voter(DEMO_USERS.alex_m),    voter(DEMO_USERS.sam_r),
      voter(DEMO_USERS.mia_t),     voter(DEMO_USERS.chris_b),   voter(DEMO_USERS.avery_n),
      voter(DEMO_USERS.jamie_k),   voter(DEMO_USERS.quinn_f),   voter(DEMO_USERS.skyler_g),
      voter(DEMO_USERS.kendall_b), voter(DEMO_USERS.tatum_h),   voter(DEMO_USERS.finley_c),
      voter(DEMO_USERS.madison_j), voter(DEMO_USERS.emerson_c), voter(DEMO_USERS.remy_v),
      voter(DEMO_USERS.sterling_f),voter(DEMO_USERS.river_n),   voter(DEMO_USERS.rowan_e),
    ],
    get vote_count() { return this.voters.length; },
    get liveCount()  { return this.voters.length; },
  },
  {
    id: 'demo-wyr-opt-1', challenge_id: DEMO_CHALLENGES.format.id, text: 'Always underdressed', position: 1,
    is_other: false, created_at: '2024-01-01T00:00:00Z',
    voters: [
      voter(DEMO_USERS.taylor_w), voter(DEMO_USERS.morgan_l), voter(DEMO_USERS.riley_p),
      voter(DEMO_USERS.casey_h),  voter(DEMO_USERS.drew_v),   voter(DEMO_USERS.blake_s),
      voter(DEMO_USERS.reese_d),  voter(DEMO_USERS.hayden_m), voter(DEMO_USERS.dakota_r),
      voter(DEMO_USERS.peyton_a), voter(DEMO_USERS.sawyer_t), voter(DEMO_USERS.logan_w),
    ],
    get vote_count() { return this.voters.length; },
    get liveCount()  { return this.voters.length; },
  },
];
export const DEMO_WYR_TOTAL_VOTES = DEMO_WYR_OPTIONS.reduce((s, o) => s + o.liveCount, 0);

// Lookup maps for PollResultCard — keyed by challenge.id
export const DEMO_OPTIONS_BY_CHALLENGE: Record<string, DemoPollOptionRow[]> = {
  [DEMO_CHALLENGES.poll.id]: DEMO_POLL_OPTIONS,
  [DEMO_CHALLENGES.format.id]: DEMO_WYR_OPTIONS,
};
export const DEMO_TOTAL_VOTES_BY_CHALLENGE: Record<string, number> = {
  [DEMO_CHALLENGES.poll.id]: DEMO_POLL_TOTAL_VOTES,
  [DEMO_CHALLENGES.format.id]: DEMO_WYR_TOTAL_VOTES,
};

// ---------------------------------------------------------------------------
// Feed posts per challenge type
// ---------------------------------------------------------------------------

// Community poll post — single shared card showing all vote results (like the real app)
const communityPollPost: Post = {
  id: 'demo-community-poll',
  user_event_id: null,
  user_id: 'community',
  type: 'poll_vote',
  caption: null,
  photo_url: null,
  front_photo_url: null,
  video_url: null,
  is_late: false,
  is_community_poll: true,
  selected_option_index: null,
  reaction_count: 0,
  comment_count: 0,
  comments_disabled: true,
  visibility: 'friends',
  created_at: new Date(now - 25 * MIN).toISOString(),
  reaction_breakdown: {} as any,
  my_reactions: [],
  profile: undefined,
  challenge: DEMO_CHALLENGES.poll,
};

// Community WYR post — single shared card for Would You Rather
const communityWyrPost: Post = {
  id: 'demo-community-wyr',
  user_event_id: null,
  user_id: 'community',
  type: 'poll_vote',
  caption: null,
  photo_url: null,
  front_photo_url: null,
  video_url: null,
  is_late: false,
  is_community_poll: true,
  selected_option_index: null,
  reaction_count: 0,
  comment_count: 0,
  comments_disabled: true,
  visibility: 'friends',
  created_at: new Date(now - 20 * MIN).toISOString(),
  reaction_breakdown: {} as any,
  my_reactions: [],
  profile: undefined,
  challenge: DEMO_CHALLENGES.format,
};

export const DEMO_FEED_POSTS_BY_TYPE: Record<ChallengeType, Post[]> = {
  photo: [
    photoPost('demo-photo-1', 'jordan_k', 'My morning setup — finally got the lighting right', 'id/10', 22),
    photoPost('demo-photo-2', 'alex_m', 'Coffee + notebook, the only way to start', 'id/20', 18),
    photoPost('demo-photo-3', 'sam_r', 'Desk view today — chaotic but functional 😅', 'id/30', 14),
    photoPost('demo-photo-4', 'mia_t', 'Caught the sunrise on the way in. Worth waking up for', 'id/50', 9),
    photoPost('demo-photo-5', 'chris_b', "Backyard this morning — neighbor's cat crashed the shot", 'id/100', 5),
  ],
  // Poll and WYR: ONE shared community card only (mirrors real app behavior)
  poll: [communityPollPost],
  task: [
    textPost('demo-task-1', 'jordan_k', 'Productive chaos. Three meetings, one good idea, two cold coffees. Somehow still smiling.', 'task', 21),
    textPost('demo-task-2', 'alex_m', 'Quiet. The good kind — windows open, to-do list shrinking, no notifications until noon.', 'task', 17),
    textPost('demo-task-3', 'sam_r', 'A slow start that turned into something. By lunch I had momentum. By dinner, done.', 'task', 12),
    textPost('demo-task-4', 'mia_t', 'Unexpectedly good. Someone brought donuts. The rest is history.', 'task', 7),
    textPost('demo-task-5', 'chris_b', "One step forward, two steps sideways. But I'm still moving.", 'task', 2),
  ],
  format: [communityWyrPost],
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

// Likers per comment ID — single source of truth for like_count and the viewer sheet.
// Keys follow the pattern `demo-comment-${postId}-${commentIndex}`.
// Commenter of a given index cannot appear in their own liker list.
const COMMENT_LIKE_DEFS: Record<string, string[]> = {
  // photo-1: commenters = [alex_m, sam_r, mia_t]
  'demo-comment-demo-photo-1-0': ['sam_r', 'mia_t', 'jordan_k'],
  'demo-comment-demo-photo-1-1': ['chris_b', 'avery_n'],
  'demo-comment-demo-photo-1-2': ['taylor_w'],
  // photo-2: commenters = [chris_b, taylor_w, morgan_l]
  'demo-comment-demo-photo-2-0': ['jordan_k', 'mia_t', 'riley_p'],
  'demo-comment-demo-photo-2-1': ['casey_h'],
  // photo-3: commenters = [riley_p, casey_h, drew_v]
  'demo-comment-demo-photo-3-0': ['alex_m', 'drew_v'],
  'demo-comment-demo-photo-3-2': ['sam_r', 'blake_s', 'quinn_f'],
  // photo-4: commenters = [jordan_k, morgan_l, riley_p]
  'demo-comment-demo-photo-4-0': ['alex_m', 'mia_t', 'finley_c', 'skyler_g'],
  'demo-comment-demo-photo-4-1': ['riley_p'],
  'demo-comment-demo-photo-4-2': ['chris_b', 'morgan_l'],
  // photo-5: commenters = [taylor_w, drew_v, alex_m]
  'demo-comment-demo-photo-5-0': ['sam_r', 'mia_t'],
  'demo-comment-demo-photo-5-1': ['casey_h', 'morgan_l', 'jordan_k'],
  // task-1: commenters = [quinn_f, reese_d, skyler_g]
  'demo-comment-demo-task-1-0': ['reese_d', 'taylor_w'],
  'demo-comment-demo-task-1-1': ['jordan_k', 'chris_b', 'riley_p'],
  // task-2: commenters = [dakota_r, finley_c, hayden_m]
  'demo-comment-demo-task-2-0': ['sam_r', 'morgan_l'],
  'demo-comment-demo-task-2-1': ['riley_p', 'drew_v'],
  'demo-comment-demo-task-2-2': ['alex_m', 'mia_t', 'casey_h'],
  // task-3: commenters = [kendall_b, logan_w, madison_j]
  'demo-comment-demo-task-3-0': ['alex_m', 'mia_t', 'taylor_w'],
  'demo-comment-demo-task-3-2': ['morgan_l', 'rowan_e'],
  // task-4: commenters = [peyton_a, rowan_e, sawyer_t]
  'demo-comment-demo-task-4-0': ['jordan_k', 'alex_m', 'sam_r', 'emerson_c'],
  'demo-comment-demo-task-4-1': ['chris_b'],
  'demo-comment-demo-task-4-2': ['drew_v', 'blake_s'],
  // task-5: commenters = [sterling_f, tatum_h, river_n]
  'demo-comment-demo-task-5-0': ['sam_r', 'mia_t', 'kendall_b'],
  'demo-comment-demo-task-5-1': ['finley_c'],
};

type CommentLikerEntry = {
  id: string;
  user_id: string;
  created_at: string;
  profile: Pick<Profile, 'username' | 'display_name' | 'avatar_url' | 'equipped_border_key'> | null;
};

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
    like_count: (COMMENT_LIKE_DEFS[`demo-comment-${postId}-${i}`] ?? []).length,
    created_at: new Date(t + (i + 1) * 3 * 60_000).toISOString(),
    updated_at: null,
    body_edited: false,
    my_like: false,
    profile: DEMO_USERS[username],
  }));
}

const COMMENT_ASSIGNEES = [
  ['alex_m',    'sam_r',     'mia_t'],
  ['chris_b',   'taylor_w',  'morgan_l'],
  ['riley_p',   'casey_h',   'drew_v'],
  ['jordan_k',  'morgan_l',  'riley_p'],
  ['taylor_w',  'drew_v',    'alex_m'],
  ['avery_n',   'jamie_k',   'blake_s'],
  ['quinn_f',   'reese_d',   'skyler_g'],
  ['dakota_r',  'finley_c',  'hayden_m'],
  ['kendall_b', 'logan_w',   'madison_j'],
  ['peyton_a',  'rowan_e',   'sawyer_t'],
  ['sterling_f','tatum_h',   'river_n'],
  ['emerson_c', 'remy_v',    'jordan_k'],
];

export const DEMO_COMMENTS_BY_POST: Record<string, Comment[]> = {};
ALL_POST_IDS.forEach((id, idx) => {
  DEMO_COMMENTS_BY_POST[id] = makeComments(id, COMMENT_ASSIGNEES[idx % COMMENT_ASSIGNEES.length]);
});

export const DEMO_COMMENT_LIKES_BY_COMMENT: Record<string, CommentLikerEntry[]> = Object.fromEntries(
  Object.entries(COMMENT_LIKE_DEFS).map(([commentId, usernames]) => [
    commentId,
    usernames.map((username, i) => {
      const u = DEMO_USERS[username];
      return {
        id: `demo-clrow-${commentId}-${i}`,
        user_id: u.id,
        created_at: new Date(now - (120 - i * 5) * MIN).toISOString(),
        profile: { username: u.username, display_name: u.display_name, avatar_url: u.avatar_url, equipped_border_key: null },
      };
    }),
  ]),
);

// ---------------------------------------------------------------------------
// Demo reactions — derived directly from REACTION_DEFS so post counts match viewer
// ---------------------------------------------------------------------------

export const DEMO_REACTIONS_BY_POST: Record<string, Reaction[]> = Object.fromEntries(
  Object.entries(REACTION_DEFS).map(([postId, defs]) => [
    postId,
    defs.map(([username, emoji], i) => ({
      id: `demo-reaction-${postId}-${i}`,
      post_id: postId,
      user_id: DEMO_USERS[username].id,
      emoji,
      created_at: new Date(now - (60 - i * 2) * MIN).toISOString(),
      profile: DEMO_USERS[username],
    })),
  ]),
);

// ---------------------------------------------------------------------------
// Demo social data — friends & leaderboard
// ---------------------------------------------------------------------------

export const DEMO_INITIAL_FRIEND_USERNAMES = [
  'jordan_k', 'alex_m', 'sam_r', 'mia_t', 'chris_b', 'taylor_w', 'morgan_l', 'casey_h',
] as const;

export const DEMO_INITIAL_PENDING_RECEIVED_USERNAMES = ['riley_p', 'drew_v'] as const;

/** All non-community demo posts, used for useProfilePosts in demo mode. */
export const DEMO_ALL_USER_POSTS: Post[] = [
  ...DEMO_FEED_POSTS_BY_TYPE.photo,
  ...DEMO_FEED_POSTS_BY_TYPE.task,
];

/** Weekly XP for demo leaderboard (keyed by profile.id). Me is added at runtime with DEMO_ME_WEEKLY_XP. */
export const DEMO_WEEKLY_XP: Record<string, number> = {
  [DEMO_USERS.taylor_w.id]:   180,
  [DEMO_USERS.jamie_k.id]:    150,
  [DEMO_USERS.kendall_b.id]:  140,
  [DEMO_USERS.sam_r.id]:      130,
  [DEMO_USERS.tatum_h.id]:    110,
  [DEMO_USERS.emerson_c.id]:  100,
  [DEMO_USERS.madison_j.id]:   95,
  [DEMO_USERS.skyler_g.id]:    85,
  [DEMO_USERS.casey_h.id]:     75,
  [DEMO_USERS.jordan_k.id]:    70,
  [DEMO_USERS.rowan_e.id]:     65,
  [DEMO_USERS.avery_n.id]:     60,
  [DEMO_USERS.quinn_f.id]:     55,
  [DEMO_USERS.sterling_f.id]:  50,
  [DEMO_USERS.morgan_l.id]:    45,
};

export const DEMO_ME_WEEKLY_XP = 120;

// ---------------------------------------------------------------------------
// Demo notifications
// ---------------------------------------------------------------------------

const recentAgo = (mins: number) => new Date(now - mins * MIN).toISOString();

export const DEMO_NOTIFICATIONS: NotificationCenterItem[] = [
  {
    key: 'demo-notif-reaction-1',
    kind: 'reactions_group',
    post_id: 'demo-photo-1',
    count: 14,
    emojis: ['fire', 'heart', 'wow'],
    actors: [DEMO_USERS.alex_m, DEMO_USERS.jamie_k, DEMO_USERS.kendall_b],
    sortAt: recentAgo(4),
  },
  {
    key: 'demo-notif-comment-1',
    kind: 'comment',
    post_id: 'demo-photo-1',
    comment_id: 'demo-comment-demo-photo-1-0',
    actor: DEMO_USERS.tatum_h,
    sortAt: recentAgo(9),
  },
  {
    key: 'demo-notif-friend-1',
    kind: 'friend_request',
    friendship: {
      id: 'demo-friendship-1',
      requester_id: DEMO_USERS.skyler_g.id,
      addressee_id: 'demo-me',
      status: 'pending' as const,
      created_at: recentAgo(14),
      accepted_at: null,
      requester: DEMO_USERS.skyler_g,
    },
    sortAt: recentAgo(14),
  },
  {
    key: 'demo-notif-reply-1',
    kind: 'comment_reply',
    post_id: 'demo-task-1',
    comment_id: 'demo-comment-demo-task-1-1',
    actor: DEMO_USERS.emerson_c,
    sortAt: recentAgo(22),
  },
  {
    key: 'demo-notif-reaction-2',
    kind: 'reactions_group',
    post_id: 'demo-task-2',
    count: 9,
    emojis: ['heart', 'like', 'fire'],
    actors: [DEMO_USERS.morgan_l, DEMO_USERS.riley_p, DEMO_USERS.rowan_e],
    sortAt: recentAgo(38),
  },
  {
    key: 'demo-notif-badge-1',
    kind: 'badge_earned',
    categoryId: 'social',
    categoryName: 'Social Butterfly',
    categoryEmoji: '🦋',
    tier: 'silver',
    sortAt: recentAgo(55),
  },
  {
    key: 'demo-notif-comment-2',
    kind: 'comment',
    post_id: 'demo-photo-2',
    comment_id: 'demo-comment-demo-photo-2-0',
    actor: DEMO_USERS.drew_v,
    sortAt: recentAgo(80),
  },
  {
    key: 'demo-notif-friend-2',
    kind: 'friend_accepted',
    friendship: {
      id: 'demo-friendship-2',
      requester_id: 'demo-me',
      addressee_id: DEMO_USERS.madison_j.id,
      status: 'accepted' as const,
      created_at: recentAgo(110),
      accepted_at: recentAgo(100),
      addressee: DEMO_USERS.madison_j,
    },
    sortAt: recentAgo(100),
  },
  {
    key: 'demo-notif-badge-2',
    kind: 'badge_earned',
    categoryId: 'physical',
    categoryName: 'On the Move',
    categoryEmoji: '🏃',
    tier: 'bronze',
    sortAt: recentAgo(140),
  },
];
