// Preserve Expo's own Babel options and only lower import() for Jest's CommonJS
// sandbox. Metro/native builds retain the same options in babel.config.cts.
import type { TransformOptions } from '@babel/core';
const expoPreset: {
  transform: Record<string, [string, TransformOptions]>;
} = require('jest-expo/jest-preset');
const entry = expoPreset.transform['\\.[jt]sx?$'];
if (!entry) throw Error('Expo Jest transformer configuration missing');
const [transformer, options] = entry;
const babelJest: typeof import('babel-jest') = require(transformer);
module.exports = babelJest.createTransformer({
  ...options,
  plugins: [...(options.plugins || []), 'babel-plugin-dynamic-import-node'],
});
