import type { PlaywrightTestConfig } from '@playwright/test';

// Derived release configs must inherit exactly one server, not silently spread
// an array/undefined into a server with no command.
export function singleServer(config: PlaywrightTestConfig) {
  if (!config.webServer || Array.isArray(config.webServer))
    throw Error('Expected one explicit local test server');
  return config.webServer;
}
