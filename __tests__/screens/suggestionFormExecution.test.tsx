import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { TextInput } from 'react-native';
import Toast from 'react-native-toast-message';
import Suggest from '../../app/(app)/(tabs)/suggest-challenge';
import { KeyboardToolbarProvider } from '../../contexts/KeyboardToolbarContext';
import { Button } from '../../components/ui/Button';
import { hashSuggestionBody } from '../../lib/hashString';

const mockCommand = jest.fn();
let mockId: string | null = 'self';
jest.mock('../../contexts/ThemeContext', () => ({
  useTheme: () => ({ colors: require('../../constants/theme').lightColors }),
}));
jest.mock('../../stores/useAuthStore', () => ({
  useAuthStore: (selector: (s: unknown) => unknown) =>
    selector({ session: mockId ? { user: { id: mockId } } : null }),
}));
jest.mock('../../lib/commandGateway', () => ({
  executeCommand: (...args: unknown[]) => mockCommand(...args),
}));
jest.mock(
  'react-native-safe-area-context',
  () => jest.requireActual('react-native-safe-area-context/jest/mock').default,
);
jest.mock('react-native-keyboard-controller', () =>
  require('react-native-keyboard-controller/jest'),
);
jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(),
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light' },
}));
jest.mock('react-native-toast-message', () => ({ show: jest.fn() }));
const start = () =>
  render(
    <KeyboardToolbarProvider>
      <Suggest />
    </KeyboardToolbarProvider>,
  );
const valid = (ui: ReturnType<typeof render>, kind = 'Question') => {
  fireEvent.press(ui.getByLabelText(kind));
  fireEvent.changeText(
    ui.getByPlaceholderText(
      kind === 'Poll' || kind === 'Would you rather'
        ? 'e.g. Best snack for a road trip?'
        : 'Describe your challenge…',
    ),
    '  What inspires your day?  ',
  );
  if (kind === 'Poll' || kind === 'Would you rather') {
    fireEvent.changeText(ui.getByPlaceholderText('Option 1'), ' Sunrise ');
    fireEvent.changeText(ui.getByPlaceholderText('Option 2'), 'Sunset');
  }
};
const submit = async (ui: ReturnType<typeof render>, force = false) => {
  await act(async () => {
    if (force) await ui.UNSAFE_getByType(Button).props.onPress();
    else fireEvent.press(ui.getByText('Submit to pool'));
  });
};
beforeEach(() => {
  jest.clearAllMocks();
  mockId = 'self';
  mockCommand.mockResolvedValue({ error: null });
});
it.each([
  ['Poll', 'poll', ['Sunrise', 'Sunset']],
  ['Would you rather', 'wyr', ['Sunrise', 'Sunset']],
  ['Question', 'question', []],
  ['Photo idea', 'photo_idea', []],
  ['Format question', 'format_question', { answer_rule: { type: 'exact_word_count', count: 2 } }],
])(
  'submits %s with matching structured data and a stable content hash',
  async (label, kind, options) => {
    const ui = start();
    valid(ui, label as string);
    await submit(ui);
    expect(mockCommand).toHaveBeenCalledWith('submit_challenge_suggestion', {
      p_kind: kind,
      p_body: 'What inspires your day?',
      p_options: options,
      p_body_hash: hashSuggestionBody(
        JSON.stringify({ kind, body: 'What inspires your day?', options }),
      ),
      p_idempotency_key: expect.any(String),
    });
    expect(Toast.show).toHaveBeenCalledWith({
      type: 'success',
      text1: 'Thanks! Your idea was submitted.',
    });
    expect(ui.UNSAFE_getAllByType(TextInput)[0].props.value).toBe('');
  },
);
it('normalizes a starting-letter rule and validates blank letters', async () => {
  const ui = start();
  valid(ui, 'Format question');
  fireEvent.press(ui.getByText('Starts with letter'));
  fireEvent.changeText(ui.UNSAFE_getAllByType(TextInput)[1], '');
  expect(ui.getByText('Set a valid format rule.')).toBeTruthy();
  await submit(ui, true);
  expect(mockCommand).not.toHaveBeenCalled();
  fireEvent.changeText(ui.UNSAFE_getAllByType(TextInput)[1], 'alpha');
  await submit(ui);
  expect(mockCommand.mock.calls[0][1].p_options).toEqual({
    answer_rule: { type: 'starts_with_letter', letter: 'A' },
  });
});
it('clamps the word-count stepper to the supported range', async () => {
  const ui = start();
  valid(ui, 'Format question');
  for (let i = 0; i < 3; i++) fireEvent.press(ui.getByLabelText('Decrease word count'));
  expect(ui.getByText('1')).toBeTruthy();
  for (let i = 0; i < 22; i++) fireEvent.press(ui.getByLabelText('Increase word count'));
  expect(ui.getByText('20')).toBeTruthy();
  await submit(ui);
  expect(mockCommand.mock.calls[0][1].p_options).toEqual({
    answer_rule: { type: 'exact_word_count', count: 20 },
  });
});
it('adds/removes poll choices and caps the visible rows at eight', async () => {
  const ui = start();
  valid(ui, 'Poll');
  fireEvent.press(ui.getByLabelText('Add poll option'));
  fireEvent.changeText(ui.getByPlaceholderText('Option 3'), 'Third');
  fireEvent.press(ui.getByLabelText('Remove option 2'));
  expect(ui.getByPlaceholderText('Option 2').props.value).toBe('Third');
  for (let i = 0; i < 6; i++) fireEvent.press(ui.getByLabelText('Add poll option'));
  expect(ui.queryByLabelText('Add poll option')).toBeNull();
  await submit(ui);
  expect(mockCommand.mock.calls[0][1].p_options).toEqual(['Sunrise', 'Third']);
});
it.each(['Other', 'other', 'OTHER', '  oThEr  ', '\tOther\n', '\u00a0Other\u00a0'])(
  'removes reserved poll choice %j from the UI and submitted payload',
  async (choice) => {
    const ui = start();
    valid(ui, 'Poll');
    fireEvent.press(ui.getByLabelText('Add poll option'));
    fireEvent.changeText(ui.getByPlaceholderText('Option 3'), choice);
    fireEvent(ui.getByPlaceholderText('Option 3'), 'blur');
    expect(ui.queryByPlaceholderText('Option 3')).toBeNull();
    await submit(ui);
    expect(mockCommand.mock.calls[0][1].p_options).toEqual(['Sunrise', 'Sunset']);
  },
);
it('filters Other even without blur and still requires two real poll choices', async () => {
  const ui = start();
  valid(ui, 'Poll');
  fireEvent.changeText(ui.getByPlaceholderText('Option 2'), 'Other');
  expect(ui.UNSAFE_getByType(Button).props.disabled).toBe(true);
  await submit(ui, true);
  expect(mockCommand).not.toHaveBeenCalled();
  fireEvent(ui.getByPlaceholderText('Option 2'), 'blur');
  expect(ui.getByPlaceholderText('Option 2').props.value).toBe('');
  fireEvent.changeText(ui.getByPlaceholderText('Option 2'), 'Sunset');
  fireEvent.press(ui.getByLabelText('Add poll option'));
  fireEvent.changeText(ui.getByPlaceholderText('Option 3'), 'Other');
  await submit(ui, true);
  expect(mockCommand.mock.calls[0][1].p_options).toEqual(['Sunrise', 'Sunset']);
});
it('reserves only the entire Other label for polls, not phrases or Would you rather', async () => {
  const ui = start();
  valid(ui, 'Poll');
  fireEvent.changeText(ui.getByPlaceholderText('Option 1'), 'Help other people');
  await submit(ui);
  expect(mockCommand.mock.calls[0][1].p_options).toEqual(['Help other people', 'Sunset']);
  mockCommand.mockClear();
  valid(ui, 'Would you rather');
  fireEvent.changeText(ui.getByPlaceholderText('Option 1'), 'Other');
  await submit(ui);
  expect(mockCommand.mock.calls[0][1].p_options).toEqual(['Other', 'Sunset']);
});
it.each([
  'short',
  'long',
  'missing options',
  'wyr options',
  'long option',
  'body language',
  'option language',
])('rejects %s before a command', async (reason) => {
  const ui = start();
  valid(ui, reason === 'wyr options' ? 'Would you rather' : 'Poll');
  if (reason === 'short')
    fireEvent.changeText(ui.getByPlaceholderText('e.g. Best snack for a road trip?'), 'tiny');
  if (reason === 'long')
    fireEvent.changeText(
      ui.getByPlaceholderText('e.g. Best snack for a road trip?'),
      'x'.repeat(501),
    );
  if (reason === 'missing options' || reason === 'wyr options')
    fireEvent.changeText(ui.getByPlaceholderText('Option 2'), '');
  if (reason === 'long option')
    fireEvent.changeText(ui.getByPlaceholderText('Option 1'), 'x'.repeat(101));
  if (reason === 'body language')
    fireEvent.changeText(
      ui.getByPlaceholderText('e.g. Best snack for a road trip?'),
      'This is shit content',
    );
  if (reason === 'option language')
    fireEvent.changeText(ui.getByPlaceholderText('Option 1'), 'shit');
  await submit(ui, true);
  expect(mockCommand).not.toHaveBeenCalled();
  expect(Toast.show).not.toHaveBeenCalled();
});
it.each(['duplicate', 'server', 'throw'])('preserves the idea on %s', async (mode) => {
  if (mode === 'throw') mockCommand.mockRejectedValue(new Error('offline'));
  else mockCommand.mockResolvedValue({ error: { code: mode === 'duplicate' ? '23505' : 'other' } });
  const ui = start();
  valid(ui);
  await submit(ui);
  expect(
    ui.getByText(
      mode === 'duplicate'
        ? 'This idea is already in the pool'
        : 'Could not submit your idea. Try again later.',
    ),
  ).toBeTruthy();
  expect(ui.getByPlaceholderText('Describe your challenge…').props.value).toBe(
    '  What inspires your day?  ',
  );
  expect(Toast.show).not.toHaveBeenCalled();
});
it('requires a member identity and disables editing while the command is pending', async () => {
  mockId = null;
  const ui = start();
  valid(ui);
  await submit(ui);
  expect(mockCommand).not.toHaveBeenCalled();
  ui.unmount();
  mockId = 'self';
  let resolve!: (v: unknown) => void;
  mockCommand.mockImplementation(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  const active = start();
  valid(active);
  await submit(active);
  expect(active.getByPlaceholderText('Describe your challenge…').props.editable).toBe(false);
  expect(active.UNSAFE_getByType(Button).props.loading).toBe(true);
  await act(async () => resolve({ error: null }));
  expect(Toast.show).toHaveBeenCalledTimes(1);
});
