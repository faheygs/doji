/// <reference path="../deno.d.ts" />
import {safetyRemovalAlerts} from '../_shared/safety-removal-alerts.ts';
Deno.serve(request=>safetyRemovalAlerts(request,{
 enabled:Deno.env.get('SAFETY_REMOVAL_ALERTS_ENABLED')==='true',
 secret:Deno.env.get('SAFETY_REMOVAL_DISPATCH_SECRET')??'',
 supabaseUrl:Deno.env.get('SUPABASE_URL')??'',serviceKey:Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')??'',
 cloudflareAccountId:Deno.env.get('SAFETY_CLOUDFLARE_ACCOUNT_ID')??'',
 cloudflareToken:Deno.env.get('SAFETY_CLOUDFLARE_EMAIL_TOKEN')??'',
}));
