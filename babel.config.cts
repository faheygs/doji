import type { ConfigAPI, TransformOptions } from '@babel/core';
module.exports = function (api: ConfigAPI): TransformOptions {
  api.cache.forever();
  return {
    presets: ['babel-preset-expo'],
    plugins: ['react-native-reanimated/plugin'],
  };
};
