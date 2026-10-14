// Dedicated business sender. No member or employee runtime dependency.
import pg from 'pg';
import { createBusinessMailHandler } from '../../../infra/business-email/hosted.mts';
import { createBusinessMailSql } from '../../../infra/business-email/restricted-sql.mts';
let handler:((request:Request)=>Promise<Response>)|undefined;
Deno.serve(async(request:Request)=>{
 try {
  if(!handler) {
   const config=JSON.parse(Deno.env.get('BUSINESS_APPLICATION_MAIL_CONFIG')||'null');
   if(!config||config.enabled!==true||config.clientId!=='client_01M3T51363MDZZK6X8DB7NS32N'||
    Deno.env.get('SUPABASE_URL')!=='https://tvixsmqxotuvyjqzmjla.supabase.co') return new Response(null,{status:503});
   handler=createBusinessMailHandler(config,createBusinessMailSql(config.database,o=>new pg.Client(o)));
  }
  return await handler(request);
 } catch {return new Response(null,{status:503,headers:{'cache-control':'no-store'}});}
});
