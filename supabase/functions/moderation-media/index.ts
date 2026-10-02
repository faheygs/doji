/// <reference path="../deno.d.ts" />
import {moderationMediaDispatch} from '../_shared/moderation-media-dispatch.ts';
Deno.serve(request=>moderationMediaDispatch(request,{
 enabled:Deno.env.get('MODERATION_MEDIA_ENABLED')==='true',
 secret:Deno.env.get('MODERATION_MEDIA_DISPATCH_SECRET')||'',
 supabaseUrl:Deno.env.get('SUPABASE_URL')||'',
 serviceKey:Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'',
}));
