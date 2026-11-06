const { getSentryExpoConfig } =
  require('@sentry/react-native/metro') as typeof import('@sentry/react-native/metro');

// Inject the same Debug ID into the shipped bundle and uploaded source map.
// Keep Expo defaults; do not enable replay or component-name instrumentation.
const config = getSentryExpoConfig(__dirname, { includeWebReplay: false });
module.exports = config;
if (process.env.DOJI_LOCAL_METRO === 'true') {
  const {
    localMetroBlockList,
  }: import('./plugins/localMetroPolicy.cts').LocalMetroPolicy = require('./plugins/localMetroPolicy.cts');
  const existing = config.resolver?.blockList;
  module.exports = {
    ...config,
    resolver: {
      ...config.resolver,
      blockList: [
        ...(Array.isArray(existing) ? existing : existing ? [existing] : []),
        localMetroBlockList(__dirname),
      ],
    },
  };
}
