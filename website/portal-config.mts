// This checked-in file keeps local previews isolated from production.
// Deployment replaces these public values for the private admin host.
Object.assign(window, {
  DOJI_PORTAL_CONFIG: Object.freeze({
    mode: 'prototype',
    supabaseUrl: '',
    supabaseAnonKey: '',
    apiBaseUrl: '',
  }),
});
