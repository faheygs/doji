import {employeeServiceHeaders} from './employee-service-headers.ts';
import {renderDojiEmail} from './doji-email.ts';
import {cloudflareMailBase,safetyAlertRecipient,safetyAlertSender,verifySafetyAlertDestination,sendSafetyAlert} from './safety-removal-cloudflare.ts';
type Env={enabled:boolean;secret:string;supabaseUrl:string;serviceKey:string;cloudflareAccountId:string;cloudflareToken:string};
type Alert={id:string;lease_id:string;deadline_at:string;queue:'moderation'|'restricted_safety';envelope:{from:string;to:string}};
const uuid=/^[a-f0-9-]{36}$/i;
export async function safetyRemovalAlerts(request:Request,env:Env,upstream:typeof fetch=fetch):Promise<Response>{
 const reply=(status:number,body:object)=>Response.json(body,{status,headers:{'cache-control':'no-store'}});
 if(!env.enabled)return reply(503,{message:'Dispatcher disabled'});
 if(!env.secret||request.headers.get('authorization')!==`Bearer ${env.secret}`)return reply(401,{message:'Unauthorized'});
 if(request.method!=='POST')return reply(405,{message:'POST required'});
 if(!env.supabaseUrl||!env.serviceKey)return reply(503,{message:'Dispatcher unavailable'});
 const mailConfig={accountId:env.cloudflareAccountId,token:env.cloudflareToken};
 const rpc=async(name:string,args:object)=>{const response=await upstream(`${env.supabaseUrl.replace(/\/$/,'')}/rest/v1/rpc/${name}`,{method:'POST',headers:employeeServiceHeaders(env.serviceKey),body:JSON.stringify(args),signal:AbortSignal.timeout(8000)});if(!response.ok)throw new Error('Database unavailable');return response.json();};
 try{
  cloudflareMailBase(mailConfig);
  if(!await verifySafetyAlertDestination(mailConfig,upstream))return reply(503,{message:'Verified administrator email destination required'});
  const alerts:Alert[]=await rpc('claim_safety_removal_alerts_v1',{p_envelope:{from:safetyAlertSender,to:safetyAlertRecipient}});
  if(!Array.isArray(alerts)||alerts.length>3)throw new Error('Invalid batch');
  let accepted=0;
  for(const alert of alerts){
   if(!uuid.test(alert.id)||!uuid.test(alert.lease_id)||!Number.isFinite(Date.parse(alert.deadline_at))||!['moderation','restricted_safety'].includes(alert.queue)||alert.envelope?.to!==safetyAlertRecipient||alert.envelope?.from!==safetyAlertSender)throw new Error('Invalid alert');
    const email=renderDojiEmail({preheader:'An external request requires prompt review.',eyebrow:'External safety intake',title:'Removal request received',summary:'Open the authorized portal queue to review this request. The review target is anchored to its original receipt.',tone:'critical',facts:[{label:'Reference',value:alert.id,monospace:true},{label:'Review target (UTC)',value:alert.deadline_at}],actions:[{label:'Open review queue',href:`https://admin.dojipro.com/#${alert.queue==='restricted_safety'?'safety':'moderation'}`}],reference:alert.id,footerNote:'No submission details are included in this alert.'});
   const outcome=await sendSafetyAlert(mailConfig,{reference:alert.id,...alert.envelope,...email},upstream);
   const saved=await rpc('finish_safety_removal_alert_v1',{p_id:alert.id,p_lease_id:alert.lease_id,p_provider_id:outcome.providerId,p_terminal:outcome.terminal,p_delivery_status:outcome.status});
   if(!saved)throw new Error('Alert acknowledgment not persisted');
   if(outcome.providerId)accepted++;
  }
  return reply(200,{claimed:alerts.length,accepted});
 }catch{return reply(503,{message:'Alert delivery incomplete; durable work remains for recovery'});}
}
