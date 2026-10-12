// Isolated signed, exact-job entrypoint. No browser sessions or member credentials.
import { createHmac, timingSafeEqual } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { dispatchBusinessMail, type MailConfig, type MailSql } from './dispatch.mts';
import { boundedBody } from '../portal-identity-candidate/bounded-body.mts';
import { isRecord } from '../portal-identity-candidate/business-contracts.mts';
import type { PortalFetch } from '../portal-identity-candidate/portal-contracts.mts';
export function createBusinessMailHandler(
 config: MailConfig & { signingKey: string }, sql: MailSql, upstream: PortalFetch=fetch,
 now:()=>number=Date.now,
) {
 if (!/^[a-f0-9]{64}$/.test(config.signingKey)) throw Error('Invalid sender key');
 return async (request:Request) => {
  let authenticated=false;
  const reply=(status:number,state:string)=>Response.json({state},{status,headers:{'cache-control':'no-store'}});
  if (!config.enabled) return reply(503,'disabled');
  if(request.method!=='POST'||request.headers.has('origin')||new URL(request.url).search) return reply(404,'unavailable');
  try {
   if(!request.headers.get('content-type')?.startsWith('application/json')) return reply(400,'invalid');
   const body:unknown=JSON.parse(new TextDecoder().decode(await boundedBody(request.body,AbortSignal.timeout(2000),512)));
   const uuid=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
   if(!isRecord(body)||Object.keys(body).sort().join(',')!=='expires,id,nonce,signature'||
    typeof body.id!=='string'||!uuid.test(body.id)||typeof body.nonce!=='string'||!uuid.test(body.nonce)||
    typeof body.expires!=='number'||!Number.isSafeInteger(body.expires)||body.expires<=Math.floor(now()/1000)||body.expires>Math.floor(now()/1000)+125||
    typeof body.signature!=='string'||!/^[a-f0-9]{64}$/.test(body.signature)) return reply(401,'unauthorized');
   const expected=createHmac('sha256',config.signingKey).update(`${body.id}|${body.nonce}|${body.expires}`).digest();
   if(!timingSafeEqual(expected,Buffer.from(body.signature,'hex'))) return reply(401,'unauthorized');
   authenticated=true;
   const result=await dispatchBusinessMail(config,sql,upstream,{id:body.id,nonce:body.nonce});
   return reply(200,result.state);
  } catch(error) {
   // Only a fixed phase, only for a verified wakeup. Never return driver/provider
   // messages, query text, subjects, credentials or request bodies.
   const phase=isRecord(error)&&typeof error.mailPhase==='string'&&['connect','transaction','identity','role','claim','authorize','finish','commit'].includes(error.mailPhase)?error.mailPhase:'dispatch';
   if(authenticated)return Response.json({state:'unavailable',phase},{status:503,headers:{'cache-control':'no-store'}});
   return reply(503,'unavailable');
  }
 };
}
