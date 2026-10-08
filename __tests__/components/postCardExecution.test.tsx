import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import {
  InteractionManager,
  Platform,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { PostCard, postsVisuallyEqual } from '../../components/feed/PostCard';
import PostDetail from '../../app/(app)/post/[id]/index';
import { ReactionBar } from '../../components/feed/ReactionBar';
import { PostCommentsSheet } from '../../components/feed/PostCommentsSheet';
import { PostOptionsSheet } from '../../components/feed/PostOptionsSheet';
import { PollResultCard } from '../../components/feed/PollResultCard';
import { AppVideo } from '../../components/ui/AppVideo';
import type { Post, Challenge, UserEvent } from '../../types/database';

const mockRouter = { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => true },
  mockReport = jest.fn();
const mockCommentsPrefetch = jest.fn(),
  mockReactionsPrefetch = jest.fn(),
  mockRealtime = jest.fn(),
  mockPause = jest.fn();
let mockAuth = {
  session: { user: { id: 'self' } } as { user: { id: string } } | null,
  profile: { username: 'self' },
};
let mockMedia = {
  photo_url: null as string | null,
  front_photo_url: null as string | null,
  video_url: null as string | null,
};
let mockPostRead: { data?: Post; isLoading: boolean; error: unknown; refetch?: jest.Mock; isFetching?: boolean },
  mockEventRead: { data?: UserEvent; isLoading: boolean };
let mockParams: Record<string, string | string[] | undefined>;
let mockDark = false;
jest.mock('../../contexts/ThemeContext', () => ({
  useTheme: () => ({
    colors: require('../../constants/theme')[mockDark ? 'darkColors' : 'lightColors'],
  }),
}));
jest.mock('../../stores/useAuthStore', () => ({
  useAuthStore: Object.assign((s: (state: typeof mockAuth) => unknown) => s(mockAuth), {
    getState: () => mockAuth,
  }),
}));
jest.mock('../../contexts/ReportFlowContext', () => ({ useReportFlow: () => mockReport }));
jest.mock('../../hooks/usePostMedia', () => ({ usePostMedia: () => mockMedia }));
jest.mock('../../hooks/usePostRealtimeInvalidation', () => ({
  usePostRealtimeInvalidation: (...args: unknown[]) => mockRealtime(...args),
}));
jest.mock('../../hooks/useComments', () => ({
  prefetchCommentsForPost: (...args: unknown[]) => mockCommentsPrefetch(...args),
}));
jest.mock('../../hooks/useFeed', () => ({
  prefetchPostReactions: (...args: unknown[]) => mockReactionsPrefetch(...args),
}));
jest.mock('../../hooks/useProfile', () => ({ usePost: () => mockPostRead }));
jest.mock('../../hooks/useUserEvent', () => ({ useUserEvent: () => mockEventRead }));
// These complex children have their own execution suites; this suite verifies card wiring.
jest.mock('../../components/feed/ReactionBar', () => ({ ReactionBar: () => null }));
jest.mock('../../components/feed/PostCommentsSheet', () => ({ PostCommentsSheet: () => null }));
jest.mock('../../components/feed/PostOptionsSheet', () => ({ PostOptionsSheet: () => null }));
jest.mock('../../components/feed/PollResultCard', () => ({ PollResultCard: () => null }));
jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  usePathname: () => '/feed',
  useLocalSearchParams: () => mockParams,
}));
jest.mock(
  'react-native-safe-area-context',
  () => jest.requireActual('react-native-safe-area-context/jest/mock').default,
);
jest.mock('expo-haptics', () => ({ selectionAsync: jest.fn(), impactAsync: jest.fn(), ImpactFeedbackStyle: { Light: 'light' } }));
jest.mock('expo-video', () => ({
  VideoView: require('react-native').View,
  useVideoPlayer: (_source: unknown, callback: (p: unknown) => void) => {
    const p = { pause: mockPause, loop: true };
    callback(p);
    return p;
  },
}));
const clients: QueryClient[] = [];
const shell = (node: React.ReactNode) => {
  const client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } });
  clients.push(client);
  return <QueryClientProvider client={client}>{node}</QueryClientProvider>;
};
const post = (overrides: Partial<Post> = {}): Post =>
  ({
    id: 'post',
    user_id: 'other',
    type: 'photo',
    created_at: new Date().toISOString(),
    photo_url: null,
    front_photo_url: null,
    video_url: null,
    caption: 'Caption',
    comment_count: 3,
    reaction_count: 2,
    comments_disabled: false,
    profile: { username: 'other', avatar_url: null },
    challenge: { id: 'challenge', type: 'photo', title: 'Synthetic prompt' },
    ...overrides,
  }) as Post;
beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  mockDark = false;
  mockAuth.session = { user: { id: 'self' } };
  mockMedia = { photo_url: null, front_photo_url: null, video_url: null };
  mockParams = { id: 'post' };
  mockPostRead = { data: post(), isLoading: false, error: null };
  mockEventRead = { data: { status: 'completed' } as UserEvent, isLoading: false };
  jest.spyOn(InteractionManager, 'runAfterInteractions').mockImplementation((cb) => {
    if (typeof cb === 'function') cb();
    return { cancel: jest.fn(), then: jest.fn(), done: jest.fn() };
  });
});
afterEach(() => {
  clients.splice(0).forEach((c) => c.clear());
  jest.restoreAllMocks();
  jest.useRealTimers();
});
describe.each([false, true])('post card dark=%s', (dark) => {
  beforeEach(() => {
    mockDark = dark;
  });
  it('prefetches authorized visible interactions and routes profile/report to exact record', () => {
    const ui = render(shell(<PostCard post={post()} blurred={false} feedAudience="friends" />));
    expect(mockRealtime).toHaveBeenCalledWith('post', true, 'friends');
    expect(mockCommentsPrefetch).toHaveBeenCalledWith(expect.any(QueryClient), {
      postId: 'post',
      userId: 'self',
      audience: 'friends',
    });
    expect(mockReactionsPrefetch).toHaveBeenCalled();
    fireEvent.press(ui.getByLabelText(/^@other,/));
    expect(String(mockRouter.push.mock.calls[0][0])).toContain('other');
    fireEvent.press(ui.getByLabelText('More options'));
    expect(ui.UNSAFE_getByType(PostOptionsSheet).props.visible).toBe(true);
    act(() => ui.UNSAFE_getByType(PostOptionsSheet).props.onReport());
    expect(mockReport).toHaveBeenCalledWith({ postId: 'post', reportedUserId: 'other' });
    act(() => ui.UNSAFE_getByType(PostOptionsSheet).props.onClose());
    expect(ui.UNSAFE_getByType(PostOptionsSheet).props.visible).toBe(false);
  });
  it('opens/closes comments and responds to deep-link comment activation', () => {
    const p = post();
    const ui = render(shell(<PostCard post={p} blurred={false} />));
    act(() => ui.UNSAFE_getByType(ReactionBar).props.onOpenComments());
    expect(ui.UNSAFE_getByType(PostCommentsSheet).props.visible).toBe(true);
    act(() => ui.UNSAFE_getByType(PostCommentsSheet).props.onClose());
    expect(ui.UNSAFE_getByType(PostCommentsSheet).props.visible).toBe(false);
    ui.rerender(shell(<PostCard post={p} blurred={false} initialCommentsOpen />));
    expect(ui.UNSAFE_getByType(PostCommentsSheet).props.visible).toBe(true);
  });
  it('conceals locked media, content and interaction children', () => {
    const ui = render(shell(<PostCard post={post()} blurred />));
    expect(ui.getByLabelText("Complete today's challenge to see this post")).toBeTruthy();
    expect(ui.queryByText('Caption')).toBeNull();
    expect(ui.UNSAFE_queryByType(ReactionBar)).toBeNull();
    expect(mockCommentsPrefetch).not.toHaveBeenCalled();
    expect(mockRealtime).toHaveBeenCalledWith('post', false, 'everyone');
  });
  it('renders and swaps dual-camera images without exposing blank placeholders', () => {
    mockMedia = {
      photo_url: 'https://example.test/back',
      front_photo_url: 'https://example.test/front',
      video_url: null,
    };
    const p = post({ photo_url: 'back-ref', front_photo_url: 'front-ref', is_late: true });
    const ui = render(shell(<PostCard post={p} blurred={false} />));
    const main = () =>
      ui.UNSAFE_getAllByType(Image).find((x) => String(x.props.recyclingKey).includes('-main-'))!;
    expect(main().props.source.uri).toBe(mockMedia.photo_url);
    act(() => main().props.onDisplay());
    fireEvent.press(main());
    expect(main().props.source.uri).toBe(mockMedia.front_photo_url);
    fireEvent.press(main());
    expect(main().props.source.uri).toBe(mockMedia.photo_url);
    expect(ui.getByText('LATE')).toBeTruthy();
    expect(ui.getByText('Synthetic prompt')).toBeTruthy();
  });
  it('distinguishes pending media from video and defaults videos to paused', () => {
    const p = post({ photo_url: 'pending' });
    const ui = render(shell(<PostCard post={p} blurred={false} />));
    expect(ui.getByLabelText('Photo loading')).toBeTruthy();
    mockMedia = {
      photo_url: 'poster',
      front_photo_url: 'front',
      video_url: 'https://example.test/video',
    };
    ui.rerender(shell(<PostCard post={{ ...p, video_url: 'video' }} blurred={false} />));
    expect(ui.UNSAFE_getByType(AppVideo).props.uri).toBe(mockMedia.video_url);
    expect(mockPause).toHaveBeenCalled();
    expect(ui.UNSAFE_getAllByType(TouchableOpacity).some((x) => x.props.disabled)).toBe(true);
  });
  it.each(['task', 'format'] as const)('renders human-readable %s question and answer', (type) => {
    const ui = render(
      shell(
        <PostCard
          post={post({
            type: 'task_complete',
            challenge: {
              id: 'challenge',
              type,
              title: 'Question',
              answer_rule: { type: 'exact_word_count', count: 2 },
            } as Challenge,
          })}
          blurred={false}
        />,
      ),
    );
    expect(ui.getByText('QUESTION')).toBeTruthy();
    expect(ui.getByText('ANSWER')).toBeTruthy();
    expect(ui.getByText('Caption')).toBeTruthy();
  });
  it('uses community poll results and exact event while protecting locked votes', () => {
    const p = post({
      type: 'poll_vote',
      daily_event_id: 'daily',
      challenge: { id: 'challenge', type: 'poll', title: 'Poll question' } as Challenge,
    });
    const ui = render(shell(<PostCard post={p} blurred={false} />));
    expect(ui.UNSAFE_getByType(PollResultCard).props.dailyEventId).toBe('daily');
    act(() => ui.UNSAFE_getByType(ReactionBar).props.onOpenComments());
    expect(ui.UNSAFE_getByType(PostCommentsSheet).props.visible).toBe(true);
    ui.rerender(shell(<PostCard post={p} blurred />));
    expect(ui.UNSAFE_queryByType(PollResultCard)).toBeNull();
  });
});
it.each(['own', 'anonymous', 'inactive', 'empty'])(
  'does not prefetch irrelevant %s interactions',
  (mode) => {
    if (mode === 'anonymous') mockAuth.session = null;
    const p = post({
      user_id: mode === 'own' ? 'self' : null,
      comment_count: mode === 'empty' ? 0 : 3,
      reaction_count: mode === 'empty' ? 0 : 2,
      profile: undefined,
    });
    const ui = render(
      shell(<PostCard post={p} blurred={false} realtimeActive={mode !== 'inactive'} />),
    );
    fireEvent.press(ui.getByLabelText('Profile'));
    expect(mockRouter.push).not.toHaveBeenCalled();
    if (mode === 'own') {
      expect(ui.getByText('You')).toBeTruthy();
      expect(ui.queryByLabelText('More options')).toBeNull();
    } else expect(mockCommentsPrefetch).not.toHaveBeenCalled();
  },
);
it('prefetches comments and reactions independently', () => {
  const ui = render(shell(<PostCard post={post({ comment_count: 0 })} blurred={false} />));
  expect(mockCommentsPrefetch).not.toHaveBeenCalled();
  expect(mockReactionsPrefetch).toHaveBeenCalledTimes(1);
  ui.rerender(shell(<PostCard post={post({ reaction_count: 0 })} blurred={false} />));
  expect(mockCommentsPrefetch).toHaveBeenCalledTimes(1);
  expect(mockReactionsPrefetch).toHaveBeenCalledTimes(1);
});
it('uses paused uncached video defaults', () => {
  render(<AppVideo uri="https://example.test/video" />);
  expect(mockPause).toHaveBeenCalled();
});
it('compares every visually meaningful post field without relying on object identity', () => {
  const a = post();
  expect(postsVisuallyEqual(a, { ...a })).toBe(true);
  const changes: Partial<Post>[] = [
    { id: 'new' },
    { type: 'task_complete' },
    { selected_option_index: 1 },
    { reaction_count: 99 },
    { comment_count: 99 },
    { my_reactions: ['heart'] },
    { reaction_breakdown: { fire: 1, like: 0, dislike: 0, laugh: 0, wow: 0, heart: 0 } },
    { photo_url: 'photo' },
    { front_photo_url: 'front' },
    { video_url: 'video' },
    { caption: 'new' },
    { created_at: 'new' },
    { is_late: true },
    { comments_disabled: true },
    { is_community_poll: true },
    ...['avatar_url', 'username', 'equipped_border_key'].map(
      (k) => ({ profile: { ...a.profile, [k]: 'new' } }) as Partial<Post>,
    ),
    ...['id', 'title', 'category', 'type'].map(
      (k) => ({ challenge: { ...a.challenge, [k]: 'new' } }) as Partial<Post>,
    ),
  ];
  for (const change of changes) expect(postsVisuallyEqual(a, { ...a, ...change })).toBe(false);
});
it.each(['loading', 'wrong post', 'absent', 'error'])('post detail safely renders %s', (state) => {
  mockPostRead.isLoading = state === 'loading';
  if (state === 'wrong post') mockPostRead.data = post({ id: 'other-post' });
  if (state === 'absent') mockPostRead.data = undefined;
  if (state === 'error') mockPostRead.error = { status: 403 };
  const ui = render(shell(<PostDetail />));
  if (state === 'loading' || state === 'wrong post')
    expect(ui.UNSAFE_getByType(ActivityIndicator)).toBeTruthy();
  else expect(ui.getByText('This post is no longer available.')).toBeTruthy();
  expect(ui.UNSAFE_queryByType(PostCard)).toBeNull();
  fireEvent.press(ui.getByLabelText('Back'));
  expect(mockRouter.back).toHaveBeenCalled();
});
it.each(['ios', 'web'] as const)(
  'post detail %s resolves array params and applies participation lock',
  (platform) => {
    jest.replaceProperty(Platform, 'OS', platform);
    mockParams = {
      id: ['post'],
      openComments: ['1'],
      mentionCommentId: ['comment'],
      returnTo: '/(app)/profile',
    };
    mockEventRead.data = { status: 'pending' } as UserEvent;
    const ui = render(shell(<PostDetail />));
    expect(ui.UNSAFE_getByType(PostCard).props.initialCommentsOpen).toBe(true);
    expect(ui.UNSAFE_getByType(PostCard).props.blurred).toBe(true);
    expect(ui.UNSAFE_getByType(ScrollView).props.scrollEventThrottle).toBe(
      platform === 'web' ? 16 : undefined,
    );
    mockEventRead.isLoading = true;
    mockParams = { id: 'post' };
    ui.rerender(shell(<PostDetail />));
    expect(ui.UNSAFE_getByType(PostCard).props.blurred).toBe(false);
  },
);

it('a failed cold post read offers retry rather than claiming the post was removed', () => {
  const refetch = jest.fn();
  mockPostRead = { isLoading: false, error: { status: 504 }, refetch, isFetching: false };
  const ui = render(shell(<PostDetail />));
  expect(ui.getByText('Could not load this post. Check your connection and try again.')).toBeTruthy();
  expect(ui.queryByText('This post is no longer available.')).toBeNull();
  fireEvent.press(ui.getByText('Try again'));
  expect(refetch).toHaveBeenCalledWith({ cancelRefetch: false });
  mockPostRead.isFetching = true; ui.rerender(shell(<PostDetail />));
  fireEvent.press(ui.getByText('Try again')); expect(refetch).toHaveBeenCalledTimes(1);
});
it('a transient post refresh preserves authorized cached content, but access loss hides it', () => {
  mockPostRead.error = { status: 503 }; mockPostRead.refetch = jest.fn();
  const ui = render(shell(<PostDetail />));
  expect(ui.UNSAFE_queryByType(PostCard)).not.toBeNull();
  expect(ui.getByText('Could not refresh this post. Showing the last loaded version.')).toBeTruthy();
  mockPostRead.error = { code: '42501' }; ui.rerender(shell(<PostDetail />));
  expect(ui.UNSAFE_queryByType(PostCard)).toBeNull();
  expect(ui.getByText('This post is no longer available.')).toBeTruthy();
});
