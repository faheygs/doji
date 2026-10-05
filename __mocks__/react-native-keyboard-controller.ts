import React from 'react';
import { ScrollView, View, type ScrollViewProps, type ViewProps } from 'react-native';

module.exports = {
  KeyboardProvider: ({ children }: React.PropsWithChildren) =>
    React.createElement(React.Fragment, null, children),
  KeyboardAwareScrollView: React.forwardRef<ScrollView, ScrollViewProps>((props, ref) =>
    React.createElement(ScrollView, { ...props, ref }, props.children),
  ),
  KeyboardStickyView: ({ children, ...props }: ViewProps) =>
    React.createElement(View, props, children),
  KeyboardToolbar: () => null,
};
