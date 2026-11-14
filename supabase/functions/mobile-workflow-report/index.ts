/// <reference path="../deno.d.ts" />
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { handleMobileWorkflowReport } from './handler.ts';

Deno.serve((request: Request) =>
  handleMobileWorkflowReport(request, {
    enabled: Deno.env.get('MOBILE_WORKFLOW_REPORTING_ENABLED'),
    environment: Deno.env.get('DOJI_ENVIRONMENT'),
    url: Deno.env.get('SUPABASE_URL'),
    now: Date.now,
    async authenticate(token, signal) {
      // Auth verifies the bearer against this project's authority; claims are never decoded/trusted locally.
      const client = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_ANON_KEY')!,
        {
          auth: { persistSession: false, autoRefreshToken: false },
          global: {
            fetch: (input: RequestInfo | URL, init?: RequestInit) =>
              fetch(input, { ...init, signal, redirect: 'error' }),
          },
        },
      );
      const { data, error } = await client.auth.getUser(token);
      return error || data.user?.is_anonymous ? null : (data.user?.id ?? null);
    },
    async record(actor, batch, signal) {
      const client = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
        {
          auth: { persistSession: false, autoRefreshToken: false },
          global: {
            fetch: (input: RequestInfo | URL, init?: RequestInit) =>
              fetch(input, { ...init, signal, redirect: 'error' }),
          },
        },
      );
      const { data, error } = await client
        .rpc('record_mobile_workflow_counts_v1', { p_actor: actor, p_batch: batch })
        .abortSignal(signal);
      return error ? 'unavailable' : data;
    },
  }),
);
