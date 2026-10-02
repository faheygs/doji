/// <reference path="../deno.d.ts" />
import { businessAuth } from '../_shared/business-auth.ts';
Deno.serve((request) =>
  businessAuth(request, {
    enabled: Deno.env.get('BUSINESS_AUTH_ENABLED') === 'true',
    origin: Deno.env.get('BUSINESS_PORTAL_ORIGIN') || '',
    supabaseUrl: Deno.env.get('SUPABASE_URL') || '',
    anonKey: Deno.env.get('SUPABASE_ANON_KEY') || '',
    serviceKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '',
    resendKey: Deno.env.get('BUSINESS_RESEND_API_KEY') || Deno.env.get('RESEND_API_KEY'),
    fromEmail: Deno.env.get('BUSINESS_EMAIL_FROM') || Deno.env.get('ADMIN_FROM_EMAIL'),
    linkKey: Deno.env.get('BUSINESS_LINK_SIGNING_KEY'),
    publicAdmission: Deno.env.get('BUSINESS_AUTH_PUBLIC_ADMISSION') === 'true',
    turnstileSecret: Deno.env.get('BUSINESS_TURNSTILE_SECRET'),
  }),
);
