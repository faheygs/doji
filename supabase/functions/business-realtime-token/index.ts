/// <reference path="../deno.d.ts" />
import { Rest } from 'npm:ably@2.26.0';
import { businessRealtimeToken } from '../_shared/business-realtime.ts';
Deno.serve((request) =>
  businessRealtimeToken(
    request,
    {
      enabled: Deno.env.get('BUSINESS_REALTIME_ENABLED') === 'true',
      origin: Deno.env.get('BUSINESS_PORTAL_ORIGIN') || '',
      supabaseUrl: Deno.env.get('SUPABASE_URL') || '',
      anonKey: Deno.env.get('SUPABASE_ANON_KEY') || '',
    },
    async (params) => {
      const key = Deno.env.get('ABLY_API_KEY');
      if (!key) throw Error('Business realtime unavailable');
      return new Rest({ key }).auth.createTokenRequest(params);
    },
  ),
);
