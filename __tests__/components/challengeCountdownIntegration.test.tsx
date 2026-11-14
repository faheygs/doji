import React from 'react';
import { act, cleanup, render } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { lightColors, darkColors } from '../../constants/theme';
import { ChallengeTimer } from '../../components/challenge/ChallengeTimer';
import { UpcomingDojiBanner } from '../../components/challenge/UpcomingDojiBanner';
import { resetServerClock, syncServerClock } from '../../lib/serverClock';
import { cancelScheduledInvalidations } from '../../lib/queryInvalidationBatcher';

let mockColors = lightColors;
jest.mock('../../contexts/ThemeContext', () => ({ useTheme: () => ({ colors: mockColors }) }));

beforeEach(() => {
  jest.useFakeTimers({ now: Date.parse('2026-11-06T09:46:02-07:00') });
  resetServerClock();
});
afterEach(() => {
  cleanup();
  resetServerClock();
  jest.useRealTimers();
});

describe.each([lightColors, darkColors])('authoritative countdowns', (colors) => {
  beforeEach(() => {
    mockColors = colors;
  });

  it.each([-300_000, 300_000])(
    'ticks pre-live against server time with device skew %s',
    async (skew) => {
      jest.setSystemTime(Date.parse('2026-11-06T09:46:02-07:00') + skew);
      syncServerClock('2026-11-06T16:46:02.000000+00:00');
      const client = new QueryClient();
      const invalidate = jest.spyOn(client, 'invalidateQueries').mockResolvedValue();
      const ui = render(
        <QueryClientProvider client={client}>
          <UpcomingDojiBanner firesAt="2026-11-06T09:51:02.000000-07:00" />
        </QueryClientProvider>,
      );
      expect(ui.getByLabelText('Doji coming soon. Starts in 5:00.')).toBeTruthy();
      act(() => jest.advanceTimersByTime(1000));
      expect(ui.getByLabelText('Doji coming soon. Starts in 4:59.')).toBeTruthy();
      // A suspended callback must calculate from elapsed server time, not tick count.
      jest.setSystemTime(Date.now() + 120_000);
      act(() => jest.advanceTimersByTime(1000));
      expect(ui.getByLabelText('Doji coming soon. Starts in 2:58.')).toBeTruthy();
      act(() => jest.advanceTimersByTime(178_000));
      expect(ui.getByLabelText('Doji coming soon. Starts in 0:00.')).toBeTruthy();
      await act(async () => {
        jest.advanceTimersByTime(1);
      });
      expect(invalidate).toHaveBeenCalledTimes(2);
      for (const root of ['upcomingDoji', 'userEvent']) {
        expect(
          invalidate.mock.calls.filter(([filters]) =>
            filters?.predicate?.({ queryKey: [root] } as never),
          ),
        ).toHaveLength(1);
      }
      expect(invalidate).toHaveBeenCalledWith(
        { predicate: expect.any(Function), refetchType: 'active' },
        { cancelRefetch: false },
      );
      await act(async () => {
        jest.advanceTimersByTime(5000);
      });
      expect(invalidate).toHaveBeenCalledTimes(2);
      ui.unmount();
      cancelScheduledInvalidations(client);
      client.clear();
    },
  );

  it.each(['compact', 'ring'] as const)(
    'shows the full signup-grace deadline in %s mode',
    (variant) => {
      syncServerClock('2026-11-06T16:51:02.580081+00:00');
      const ui = render(<ChallengeTimer expiresAt="2026-11-07T00:00:00-07:00" variant={variant} />);
      expect(ui.getByLabelText('14:08:58 remaining')).toBeTruthy();
      expect(ui.getByText('14:08:58')).toBeTruthy();
      expect(ui.queryByText('10:00')).toBeNull();
      act(() => jest.advanceTimersByTime(1000));
      expect(ui.getByLabelText('14:08:57 remaining')).toBeTruthy();
      expect(ui.getByRole('timer').props.accessibilityLiveRegion).toBe('none');
    },
  );

  it('ticks the normal 600-second window and expires only once', () => {
    syncServerClock('2026-11-06T16:51:02.580081+00:00');
    const onExpire = jest.fn();
    const ui = render(
      <ChallengeTimer
        expiresAt="2026-11-06T10:01:02.580081-07:00"
        variant="ring"
        onExpire={onExpire}
      />,
    );
    expect(ui.getByLabelText('10:00 remaining')).toBeTruthy();
    act(() => jest.advanceTimersByTime(1000));
    expect(ui.getByLabelText('9:59 remaining')).toBeTruthy();
    act(() => jest.advanceTimersByTime(540_000));
    expect(ui.getByLabelText('0:59 remaining')).toBeTruthy();
    expect(ui.getByRole('timer').props.accessibilityLiveRegion).toBe('polite');
    act(() => jest.advanceTimersByTime(60_000));
    expect(ui.getByLabelText('0:00 remaining')).toBeTruthy();
    expect(onExpire).toHaveBeenCalledTimes(1);
  });
});
