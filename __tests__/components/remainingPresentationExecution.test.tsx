import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { ActivityIndicator } from 'react-native';
import Svg from 'react-native-svg';
import * as Icons from '../../components/icons/Icons';
import * as BadgeIcons from '../../components/icons/BadgeIcons';
import { PollScreen } from '../../components/challenge/PollScreen';
import { TaskScreen } from '../../components/challenge/TaskScreen';
import { KeyboardToolbarProvider } from '../../contexts/KeyboardToolbarContext';
import type { Challenge, PollOption } from '../../types/database';
jest.mock('../../contexts/ThemeContext', () => ({
  useTheme: () => ({ colors: require('../../constants/theme').lightColors }),
}));
jest.mock(
  'react-native-safe-area-context',
  () => jest.requireActual('react-native-safe-area-context/jest/mock').default,
);
jest.mock('react-native-keyboard-controller', () =>
  require('react-native-keyboard-controller/jest'),
);
const icons = Object.entries({ ...Icons, ...BadgeIcons }).filter(
  ([name, value]) =>
    name !== 'IconSpark' &&
    (name.startsWith('Icon') || name.startsWith('Icn')) &&
    typeof value === 'function',
) as [string, React.ComponentType<{ size?: number; color: string }>][];
it.each(icons)(
  '%s preserves its vector viewport and accepts theme color and explicit dimensions',
  (_name, Icon) => {
    const ui = render(<Icon color="#123456" />);
    const vector = ui.UNSAFE_getByType(Svg);
    expect(Number(vector.props.width)).toBeGreaterThan(0);
    expect(vector.props.viewBox).toBeTruthy();
    ui.rerender(<Icon color="#abcdef" size={39} />);
    expect(ui.UNSAFE_getByType(Svg).props.width).toBe(39);
    expect(ui.UNSAFE_getByType(Svg).props.height).toBe(39);
    expect(
      ui
        .UNSAFE_getByType(Svg)
        .findAll(
          (node) =>
            node.props.stroke === '#abcdef' ||
            node.props.fill === '#abcdef' ||
            node.props.stopColor === '#abcdef',
        ).length,
    ).toBeGreaterThan(0);
  },
);
const challenge = {
  id: 'challenge',
  title: 'Synthetic challenge',
  description: 'Description',
  xp_reward: 20,
} as Challenge;
const options = (votes = 3) =>
  [
    { id: 'b', text: 'Second', position: 1, vote_count: votes },
    { id: 'a', text: 'First', position: 0, vote_count: 0 },
  ] as PollOption[];
it.each([0, 1, 3])('shows authoritative totals after voting, including %s votes', (votes) => {
  const vote = jest.fn(),
    back = jest.fn();
  const ui = render(
    <PollScreen
      challenge={{ ...challenge, description: votes ? 'Description' : '' }}
      options={options(votes)}
      existingVoteOptionId="b"
      onVote={vote}
      onBack={back}
    />,
  );
  expect(ui.getByLabelText('Second').props.accessibilityState.selected).toBe(true);
  expect(ui.getAllByText(votes ? '100%' : '0%').length).toBeGreaterThan(0);
  fireEvent.press(ui.getByLabelText('First'));
  expect(vote).not.toHaveBeenCalled();
  fireEvent.press(ui.getByLabelText('Back'));
  expect(back).toHaveBeenCalled();
});
it('passes the ordered selection and prevents another vote while in flight', async () => {
  let resolve!: () => void;
  const vote = jest.fn(
    () =>
      new Promise<void>((done) => {
        resolve = done;
      }),
  );
  const ui = render(
    <PollScreen challenge={challenge} options={options()} onVote={vote} onBack={jest.fn()} />,
  );
  fireEvent.press(ui.getByLabelText('First'));
  expect(vote).toHaveBeenCalledWith('a', 0);
  expect(ui.UNSAFE_getByType(ActivityIndicator)).toBeTruthy();
  fireEvent.press(ui.getByLabelText('Second'));
  expect(vote).toHaveBeenCalledTimes(1);
  await act(async () => resolve());
  expect(ui.UNSAFE_queryByType(ActivityIndicator)).toBeNull();
});
it.each([false, true])(
  'renders task completion=%s and routes proof/back explicitly',
  async (completed) => {
    let resolve!: () => void;
    const complete = jest.fn(
        () =>
          new Promise<void>((done) => {
            resolve = done;
          }),
      ),
      photo = jest.fn(),
      back = jest.fn();
    const ui = render(
      <KeyboardToolbarProvider>
        <TaskScreen
          challenge={{ ...challenge, description: completed ? '' : 'Description' }}
          isCompleted={completed}
          onComplete={complete}
          onTakeProofPhoto={photo}
          onBack={back}
        />
      </KeyboardToolbarProvider>,
    );
    fireEvent.press(ui.getByLabelText('Back'));
    expect(back).toHaveBeenCalled();
    if (completed) {
      expect(ui.getByText('Task Completed')).toBeTruthy();
      expect(ui.queryByLabelText('Complete task')).toBeNull();
    } else {
      fireEvent.press(ui.getByLabelText('Take an optional proof photo'));
      expect(photo).toHaveBeenCalled();
      fireEvent.press(ui.getByLabelText('Complete task'));
      expect(complete).toHaveBeenCalledTimes(1);
      expect(ui.UNSAFE_getByType(ActivityIndicator)).toBeTruthy();
      await act(async () => resolve());
      expect(ui.getByText('I did it!')).toBeTruthy();
    }
  },
);
