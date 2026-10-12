import type { CreatePortalSqlClient } from '../portal-identity-candidate/restricted-sql.mts';
import type { ClientConfig } from 'pg';
import { isRecord } from '../portal-identity-candidate/business-contracts.mts';
import type { MailSql } from './dispatch.mts';
export interface MailDatabase {
 host:string; projectRef:string; port:number; database:string; username:string; password:string; ca:string;
}
const operations:Record<string,number>={
 'select business_private.claim_application_email($1::uuid,$2::uuid) as result':2,
 'select business_private.authorize_application_email($1::uuid,$2::uuid) as result':2,
 'select business_private.finish_application_email($1::uuid,$2::uuid,$3,$4) as result':4,
};
export function createBusinessMailSql(config:MailDatabase,createClient:CreatePortalSqlClient):MailSql {
 if(!/^[a-z0-9.-]+\.pooler\.supabase\.com$/.test(config.host)||config.projectRef!=='tvixsmqxotuvyjqzmjla'||
 config.port!==6543||config.database!=='postgres'||config.username!==`doji_business_mail_login.${config.projectRef}`||
 typeof config.password!=='string'||config.password.length<32||!config.ca?.startsWith('-----BEGIN CERTIFICATE-----')) throw Error('Invalid sender database');
 const options:ClientConfig={host:config.host,port:config.port,database:config.database,user:config.username,password:config.password,
  ssl:{rejectUnauthorized:true,ca:config.ca},connectionTimeoutMillis:3000,statement_timeout:3000,lock_timeout:1000,
  idle_in_transaction_session_timeout:4000,application_name:'doji-business-mail'};
 return async(query,params)=>{
  if(!Object.hasOwn(operations,query)||params.length!==operations[query]||params.some(p=>p!==null&&(typeof p!=='string'||p.length>200||p.includes('\0')))) throw Error('Invalid sender operation');
  const client=createClient(options);let ending:Promise<unknown>|undefined;
  const close=()=>ending||=(Promise.resolve().then(()=>client.end()).catch(()=>{}));
  let timer:ReturnType<typeof setTimeout>|undefined;
  let phase='connect';
  try {return await Promise.race([
   (async()=>{
    await client.connect();
    phase='transaction';
    await client.query("begin;set local statement_timeout='3s';set local lock_timeout='1s';set local idle_in_transaction_session_timeout='4s'");
    phase='identity';
    const identity=await client.query(`select session_user::text login,current_user::text actor,rolsuper or rolcreatedb or rolcreaterole or rolreplication or rolbypassrls or rolinherit privileged,pg_has_role(current_user,'doji_business_mail','MEMBER') permitted from pg_roles where rolname=current_user`);
    const r=isRecord(identity)&&Array.isArray(identity.rows)?identity.rows[0]:null;
    if(!isRecord(r)||r.login!=='doji_business_mail_login'||r.actor!==r.login||r.privileged!==false||r.permitted!==true) throw Error('Invalid sender principal');
    phase='role';await client.query('set local role doji_business_mail');
    phase=query.includes('claim_')?'claim':query.includes('authorize_')?'authorize':'finish';
    const result=await client.query({text:query,values:params});
    if(!isRecord(result)||!Array.isArray(result.rows)||result.rows.length!==1||!isRecord(result.rows[0])||!Object.hasOwn(result.rows[0],'result')) throw Error('Invalid sender result');
    phase='commit';await client.query('commit');return result.rows[0].result;
   })(),
   new Promise((_,reject)=>{timer=setTimeout(()=>{void close();reject(Error('Sender deadline'));},5000);}),
  ]);} catch {throw Object.assign(Error('Sender database unavailable'),{mailPhase:phase});}
  finally {
   clearTimeout(timer);let shutdown:ReturnType<typeof setTimeout>|undefined;
   await Promise.race([close(),new Promise(resolve=>{shutdown=setTimeout(resolve,1000);})]);
   clearTimeout(shutdown);
  }
 };
}
