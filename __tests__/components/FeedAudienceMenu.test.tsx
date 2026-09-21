import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import * as Haptics from 'expo-haptics';
import { FeedAudienceMenu } from '../../components/feed/FeedAudienceMenu';

jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(() => Promise.resolve()),
}));

jest.mock('../../contexts/ThemeContext', () => ({
  useTheme: () => ({
    colors: {
      primary: '#4CAF50',
      primaryLight: 'rgba(76,175,80,0.14)',
      surfaceElevated: '#1E1E1E',
      text: '#FFFFFF',
      textSecondary: '#9B9B9B',
      shadowBase: '#000000',
    },
  }),
}));

describe('FeedAudienceMenu', () => {
  it('opens as a dropdown and selects a different audience', () => {
    const onSelect = jest.fn();
    const screen = render(
      <FeedAudienceMenu audience="everyone" onSelect={onSelect} />,
    );

    const trigger = screen.getByLabelText('Everyone feed');
    expect(trigger.props.accessibilityState).toEqual({ expanded: false });
    expect(trigger).toHaveStyle({
      width: 190,
      borderRadius: 16,
      backgroundColor: 'rgba(76,175,80,0.14)',
      borderColor: '#4CAF5066',
    });
    expect(screen.queryByLabelText('Friends feed')).toBeNull();

    fireEvent.press(trigger);
    expect(screen.getAllByLabelText('Everyone feed')).toHaveLength(2);

    fireEvent.press(screen.getByLabelText('Friends feed'));
    expect(Haptics.selectionAsync).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith('friends');
    expect(screen.queryByLabelText('Friends feed')).toBeNull();
  });
});
