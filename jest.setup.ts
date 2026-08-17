// Provide WebSocket for Supabase realtime in Node.js < 22 test environment
const ws = require('ws');
if (typeof global.WebSocket === 'undefined') {
  // @ts-ignore
  global.WebSocket = ws.WebSocket ?? ws;
}

// Set env vars before any module imports so supabase.ts can initialize
process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';

// Reanimated 4 depends on the native Worklets runtime; Jest uses its official mock.
jest.mock('react-native-worklets', () => require('react-native-worklets/src/mock'));
require('react-native-reanimated').setUpTests();

import '@react-native-async-storage/async-storage/jest/async-storage-mock';
