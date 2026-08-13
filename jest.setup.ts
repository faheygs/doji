// Provide WebSocket for Supabase realtime in Node.js < 22 test environment
const ws = require('ws');
if (typeof global.WebSocket === 'undefined') {
  // @ts-ignore
  global.WebSocket = ws.WebSocket ?? ws;
}

// Set env vars before any module imports so supabase.ts can initialize
process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';

import '@react-native-async-storage/async-storage/jest/async-storage-mock';
