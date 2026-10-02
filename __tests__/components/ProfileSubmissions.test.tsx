import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { ProfileSubmissions } from '../../components/profile/ProfileSubmissions';
import { ReadFailureFeedback } from '../../components/ui/ReadFailureFeedback';
import type { ChallengeSuggestion } from '../../types/database';

jest.mock('../../contexts/ThemeContext', () => ({ useTheme: () => ({ colors: {
  error: '#ff0000', link: '#0000ff', success: '#008800', text: '#ffffff', border: '#888888', primary: '#00ff00', onPrimary: '#000000',
} }) }));
jest.mock('../../components/profile/SubmissionCard', () => ({ SubmissionCard: ({ submission }: any) => {
  const { Text } = require('react-native'); return <Text>{submission.body}</Text>;
} }));
jest.mock('../../components/ui/Skeleton', () => ({ Skeleton: () => null }));
const data = [{ id: 'idea-1', body: 'My saved idea' }] as ChallengeSuggestion[];
const defaults = { error: null, isPending: false, isFetching: false, onRetry: jest.fn() };

test('initial failure displays persistent feedback and retry, not an empty success', () => {
  const retry = jest.fn();
  const view = render(<ProfileSubmissions {...defaults} error={new Error('private SQL')} onRetry={retry} />);
  expect(view.getByText('My Submissions')).toBeTruthy();
  expect(view.getByText('Could not load your submissions. Please try again.')).toBeTruthy();
  expect(view.queryByText('private SQL')).toBeNull();
  fireEvent.press(view.getByLabelText('Retry loading submissions')); expect(retry).toHaveBeenCalledTimes(1);
});

test('temporary refresh failure retains saved history and retry is disabled while busy', () => {
  const retry = jest.fn();
  const view = render(<ProfileSubmissions {...defaults} data={data} error={{ status: 504 }} isFetching onRetry={retry} />);
  expect(view.getByText('My saved idea')).toBeTruthy();
  expect(view.getByText(/last loaded history/)).toBeTruthy();
  fireEvent.press(view.getByLabelText('Retry loading submissions')); expect(retry).not.toHaveBeenCalled();
  view.rerender(<ProfileSubmissions {...defaults} data={data} />);
  expect(view.queryByText(/last loaded history/)).toBeNull(); expect(view.getByText('My saved idea')).toBeTruthy();
});

test.each([401, 403])('authorization failure %s hides saved rows', status => {
  const view = render(<ProfileSubmissions {...defaults} data={data} error={{ status }} />);
  expect(view.queryByText('My saved idea')).toBeNull();
  expect(view.getByText('Could not load your submissions. Please try again.')).toBeTruthy();
});

test('cold loading is distinct from empty success and account changes remove old data', () => {
  const view = render(<ProfileSubmissions {...defaults} data={data} />);
  view.rerender(<ProfileSubmissions {...defaults} isPending />);
  expect(view.queryByText('My saved idea')).toBeNull(); expect(view.getByLabelText('Loading submissions')).toBeTruthy();
  view.rerender(<ProfileSubmissions {...defaults} data={[]} />);
  expect(view.queryByText('My Submissions')).toBeNull();
});

test('shared recovery control preserves feedback and prevents duplicate retry taps while busy', () => {
  const retry = jest.fn();
  const view = render(<ReadFailureFeedback message="Could not load friends." retrying onRetry={retry} />);
  expect(view.getByRole('alert')).toBeTruthy();
  fireEvent.press(view.getByLabelText('Try loading again')); expect(retry).not.toHaveBeenCalled();
  view.rerender(<ReadFailureFeedback message="Could not load friends." retrying={false} onRetry={retry} />);
  fireEvent.press(view.getByLabelText('Try loading again')); expect(retry).toHaveBeenCalledTimes(1);
});
