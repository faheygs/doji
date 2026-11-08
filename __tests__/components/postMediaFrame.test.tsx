import React, { StrictMode } from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { Image } from 'expo-image';
import { PostMediaFrame } from '../../components/feed/PostMediaFrame';
import { usePostCardStyles } from '../../components/feed/usePostCardStyles';
import type { Post } from '../../types/database';
jest.mock('../../contexts/ThemeContext', () => ({
  useTheme: () => ({ colors: require('../../constants/theme').lightColors }),
}));
jest.mock('../../lib/postMedia', () => ({ postMediaCacheKey: (value: string | null) => value }));
// Shared Skeleton tests cover animation; isolate the frame's watchdog here.
jest.mock('../../components/ui/Skeleton', () => ({ Skeleton: () => null }));
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light' },
}));
const retry = jest.fn(),
  thumbRetry = jest.fn();
let timers: jest.SpyInstance, cleared: jest.SpyInstance;
function expectWatchdogsCleared() {
  for (let i = 0; i < timers.mock.calls.length; i += 1) {
    if (timers.mock.calls[i][1] === 15_000)
      expect(cleared).toHaveBeenCalledWith(timers.mock.results[i].value);
  }
}
const item = {
  id: 'post',
  photo_url: 'private/back',
  front_photo_url: null,
  video_url: null,
} as Post;
const media = {
  photo_url: 'https://signed.test/back',
  front_photo_url: null,
  video_url: null,
  error: null,
  recoveryVersion: 0,
  retry,
};
function Harness({
  post = item,
  active = true,
  uri = media.photo_url,
  recoveryVersion = 0,
  showFront = false,
  frontUri = null,
}: {
  post?: Post;
  active?: boolean;
  uri?: string;
  recoveryVersion?: number;
  showFront?: boolean;
  frontUri?: string | null;
}) {
  return (
    <PostMediaFrame
      post={post}
      media={{ ...media, photo_url: uri, front_photo_url: frontUri, recoveryVersion }}
      thumbnail={{ ...media, retry: thumbRetry }}
      showFront={showFront}
      active={active}
      onToggle={() => {}}
      styles={usePostCardStyles()}
    />
  );
}
beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  timers = jest.spyOn(global, 'setTimeout');
  cleared = jest.spyOn(global, 'clearTimeout');
});
afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

test('a stalled decode exposes a local retry, ignores the retired image callback and preserves layout', () => {
  const ui = render(<Harness />);
  const oldDisplay = ui.UNSAFE_getByType(Image).props.onDisplay;
  act(() => jest.advanceTimersByTime(15_000));
  expect(ui.getByText('Media is taking longer than expected.')).toBeTruthy();
  fireEvent.press(ui.getByText('Retry media'));
  expect(retry).toHaveBeenCalledTimes(1);
  expect(thumbRetry).toHaveBeenCalledTimes(1);
  act(() => oldDisplay());
  act(() => jest.advanceTimersByTime(15_000));
  expect(ui.getByText('Media is taking longer than expected.')).toBeTruthy();
  act(() => ui.UNSAFE_getByType(Image).props.onDisplay());
  expect(ui.queryByText('Retry media')).toBeNull();
  expectWatchdogsCleared();
});

test('a native image error uses safe copy and offers explicit retry outside the disabled image toggle', () => {
  const ui = render(<Harness />);
  act(() =>
    ui
      .UNSAFE_getByType(Image)
      .props.onError({ error: 'synthetic private URL must not be displayed' }),
  );
  expect(ui.getByText('Media could not be loaded.')).toBeTruthy();
  expect(ui.queryByText(/private URL/)).toBeNull();
  fireEvent.press(ui.getByText('Retry media'));
  expect(retry).toHaveBeenCalledTimes(1);
  ui.unmount();
  expectWatchdogsCleared();
});

test('display completion works under Strict Mode and a replaced post cannot accept the old callback', () => {
  const ui = render(
    <StrictMode>
      <Harness />
    </StrictMode>,
  );
  const oldDisplay = ui.UNSAFE_getByType(Image).props.onDisplay;
  act(() => oldDisplay());
  expectWatchdogsCleared();
  ui.rerender(
    <StrictMode>
      <Harness post={{ ...item, id: 'other', photo_url: 'private/other' }} />
    </StrictMode>,
  );
  act(() => oldDisplay());
  act(() => jest.advanceTimersByTime(15_000));
  expect(ui.getByText('Retry media')).toBeTruthy();
  act(() => ui.UNSAFE_getByType(Image).props.onDisplay());
  expect(ui.queryByText('Retry media')).toBeNull();
});

test('unchanged source props remain referentially stable across metadata updates', () => {
  const ui = render(<Harness />);
  const source = ui.UNSAFE_getByType(Image).props.source;
  ui.rerender(<Harness post={{ ...item, comment_count: 10 }} />);
  expect(ui.UNSAFE_getByType(Image).props.source).toBe(source);
});

test('front-photo fallback never writes the back image under the front cache identity', () => {
  const dual = { ...item, front_photo_url: 'private/front' };
  const ui = render(<Harness post={dual} showFront />);
  expect(ui.UNSAFE_getByType(Image).props.source).toEqual({
    uri: media.photo_url,
    cacheKey: item.photo_url,
  });
  ui.rerender(<Harness post={dual} showFront frontUri="https://signed.test/front" />);
  expect(ui.UNSAFE_getAllByType(Image)[0].props.source).toEqual({
    uri: 'https://signed.test/front',
    cacheKey: 'private/front',
  });
  expect(ui.UNSAFE_getAllByType(Image)[1].props.source.cacheKey).toBe(item.photo_url);
});

test('foreground recovery retries a failed decoder but does not remount a healthy image', () => {
  const ui = render(<Harness />);
  act(() => ui.UNSAFE_getByType(Image).props.onError());
  expect(ui.getByText('Retry media')).toBeTruthy();
  ui.rerender(<Harness recoveryVersion={1} />);
  expect(ui.queryByText('Retry media')).toBeNull();
  const display = ui.UNSAFE_getByType(Image).props.onDisplay;
  act(() => display());
  ui.rerender(<Harness recoveryVersion={2} />);
  act(() => jest.advanceTimersByTime(15_000));
  expect(ui.queryByText('Retry media')).toBeNull();
  expect(retry).not.toHaveBeenCalled();
});

test.each([{ active: false }, { uri: '' }])(
  'inactive or absent media has no decode watchdog: %p',
  (props) => {
    render(<Harness {...props} />);
    expect(timers.mock.calls.some(([, delay]) => delay === 15_000)).toBe(false);
  },
);
