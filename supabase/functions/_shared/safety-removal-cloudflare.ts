// Dedicated external-intake mail only. Never used for member/login/other ops mail.
export const safetyAlertRecipient = 'faheygs@gmail.com';
export const safetyAlertSender = 'safety@dojipro.com';
export type CloudflareMailConfig = {accountId:string;token:string};
export type MailOutcome = {providerId:string|null;status:'delivered'|'queued'|'bounced'|'suppressed'|'rejected'|'uncertain';terminal:boolean};
const messageId = /^[\x21-\x7e]{1,254}$/;
export function cloudflareMailBase(config:CloudflareMailConfig):string {
 if(!/^[a-f0-9]{32}$/.test(config.accountId)||!config.token)throw new Error('Mail configuration unavailable');
 return `https://api.cloudflare.com/client/v4/accounts/${config.accountId}`;
}
export async function verifySafetyAlertDestination(config:CloudflareMailConfig,upstream:typeof fetch=fetch):Promise<boolean>{
 const response=await upstream(`${cloudflareMailBase(config)}/email/routing/addresses?per_page=50`,{
  headers:{authorization:`Bearer ${config.token}`},redirect:'error',signal:AbortSignal.timeout(8000)});
 const body=await response.json();
 // Fail closed if verification cannot be established; never fall back to paid arbitrary sending.
 return response.ok&&body.success===true&&Array.isArray(body.result)&&body.result.some((v:{email?:string;verified?:string})=>
  v.email===safetyAlertRecipient&&typeof v.verified==='string'&&Number.isFinite(Date.parse(v.verified)));
}
export function classifyCloudflareMail(status:number,body:unknown):MailOutcome {
 const uncertain:MailOutcome={providerId:null,status:'uncertain',terminal:false};
 if(status<200||status>=300)return {providerId:null,status:'rejected',terminal:status>=400&&status<500&&![408,429].includes(status)};
 if(!body||typeof body!=='object')return uncertain;
 const value=body as {success?:boolean;result?:{message_id?:unknown;delivered?:unknown;queued?:unknown;permanent_bounces?:unknown;suppressed_recipients?:unknown}};
 if(value.success!==true||!value.result)return uncertain;
 const result=value.result;
 const lists=[result.delivered,result.queued,result.permanent_bounces,result.suppressed_recipients??[]];
 if(lists.some(v=>!Array.isArray(v)||v.some(x=>x!==safetyAlertRecipient)))return uncertain;
 const hits=lists.map(v=>(v as string[]).length);
 // Exactly one known recipient outcome. Empty/conflicting/suppressed results are never success.
 if(hits.reduce((a,b)=>a+b,0)!==1)return uncertain;
 if(hits[2])return {providerId:null,status:'bounced',terminal:true};
 if(hits[3])return {providerId:null,status:'suppressed',terminal:true};
 if(typeof result.message_id!=='string'||!messageId.test(result.message_id))return uncertain;
 return {providerId:result.message_id,status:hits[0]?'delivered':'queued',terminal:false};
}
export async function sendSafetyAlert(config:CloudflareMailConfig,mail:{reference:string;from:string;to:string;html:string;text:string},upstream:typeof fetch=fetch):Promise<MailOutcome>{
 if(mail.from!==safetyAlertSender||mail.to!==safetyAlertRecipient||!/^[a-f0-9-]{36}$/i.test(mail.reference))throw new Error('Invalid alert envelope');
 try {
  const response=await upstream(`${cloudflareMailBase(config)}/email/sending/send`,{
   method:'POST',headers:{authorization:`Bearer ${config.token}`,'content-type':'application/json'},redirect:'error',signal:AbortSignal.timeout(10000),
   body:JSON.stringify({from:mail.from,to:mail.to,subject:'Doji · Urgent removal review',html:mail.html,text:mail.text,
    headers:{'X-Doji-Alert-Reference':mail.reference}})});
  return classifyCloudflareMail(response.status,await response.json().catch(()=>null));
 }catch{return {providerId:null,status:'uncertain',terminal:false};}
 // Cloudflare does NOT document idempotency keys. A lost response may produce a
 // duplicate on bounded retry. The reference correlates it; it is not a dedup key.
}
