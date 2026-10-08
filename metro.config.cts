const { getSentryExpoConfig } = require('@sentry/react-native/metro') as typeof import('@sentry/react-native/metro');

// Inject the same Debug ID into the shipped bundle and uploaded source map.
// Keep Expo defaults; do not enable replay or component-name instrumentation.
module.exports = getSentryExpoConfig(__dirname, { includeWebReplay: false });
