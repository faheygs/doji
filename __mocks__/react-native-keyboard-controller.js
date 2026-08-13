const React = require('react');
const { ScrollView, View } = require('react-native');

module.exports = {
  KeyboardProvider: ({ children }) => React.createElement(React.Fragment, null, children),
  KeyboardAwareScrollView: React.forwardRef((props, ref) =>
    React.createElement(ScrollView, { ...props, ref }, props.children),
  ),
  KeyboardStickyView: ({ children, ...props }) => React.createElement(View, props, children),
  KeyboardToolbar: () => null,
};
