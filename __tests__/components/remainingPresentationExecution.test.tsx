import React from 'react';
import { render } from '@testing-library/react-native';
import Svg from 'react-native-svg';
import * as Icons from '../../components/icons/Icons';
import * as BadgeIcons from '../../components/icons/BadgeIcons';
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
