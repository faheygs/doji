import React from 'react';
import { render } from '@testing-library/react-native';
import {
  STARTUP_BACKGROUND_COLOR,
  STARTUP_LOGO_SIZE,
  StartupBrandScreen,
} from '../../components/branding/StartupBrandScreen';

describe('StartupBrandScreen', () => {
  it('matches the native white logo launch screen without a second wordmark', () => {
    const screen = render(<StartupBrandScreen />);

    expect(screen.getByTestId('startup-brand-screen')).toHaveStyle({
      backgroundColor: STARTUP_BACKGROUND_COLOR,
    });
    expect(screen.getByLabelText('Doji')).toHaveStyle({
      width: STARTUP_LOGO_SIZE,
      height: STARTUP_LOGO_SIZE,
    });
    expect(screen.queryByText('Doji')).toBeNull();
    expect(screen.queryByLabelText('Loading Doji')).toBeNull();
  });
});
