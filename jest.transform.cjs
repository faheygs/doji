// Preserve Expo's own Babel options and only lower import() for Jest's CommonJS
// sandbox. Metro/native builds continue to use the unchanged babel.config.js.
const expoPreset = require('jest-expo/jest-preset');
const [transformer, options] = expoPreset.transform['\\.[jt]sx?$'];
module.exports = require(transformer).createTransformer({
  ...options,
  plugins: [...(options.plugins || []), 'babel-plugin-dynamic-import-node'],
});
