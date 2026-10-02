// Exact owner-authorized AuthKit invitation. Never emits invitation tokens.
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile,access} from 'node:fs/promises';
const root='test-results/employee-owner-invitation-20261001';
const email='gfahey@dojipro.com';
const config=JSON.parse(await readFile('.artifacts/workos-production/credentials.json','utf8'));
assert.equal(config.productionOnly,true);
assert.equal(config.employee.clientId,'client_01M3VE4WTBYS2XN6NZPH9EDMQD');
assert.equal(config.employee.environment,'environment_01M3VE4WMDRZ1VBVS5MNVVF19J');
const send=process.argv.includes('--send');
async function api(path,body){
  let response;
  try {response=await fetch('https://api.workos.com/user_management/'+path,{
    method:body?'POST':'GET',headers:{Authorization:'Bearer '+config.employee.apiKey,'Content-Type':'application/json'},
    ...(body?{body:JSON.stringify(body)}:{}),redirect:'error',signal:AbortSignal.timeout(15000)});}
  catch {throw Error('WorkOS response unavailable; inspect invitation status before any further send.');}
  if(!response.ok)throw Error('WorkOS request failed with HTTP '+response.status+'; response body withheld.');
  return response.json();
}
function safe(invitation){
  assert.equal(invitation.email.toLowerCase(),email);
  const url=invitation.accept_invitation_url?new URL(invitation.accept_invitation_url):null;
  return {id:invitation.id,email:invitation.email,state:invitation.state,expiresAt:invitation.expires_at,
    acceptedUserId:invitation.accepted_user_id??null,acceptOrigin:url?.origin??null};
}
await mkdir(root,{recursive:true});
const result=await api('invitations?'+new URLSearchParams({email,limit:'10'}));
assert.ok(Array.isArray(result.data));
assert.ok(!result.list_metadata?.after,'More than one page; inspect before sending.');
const existing=result.data.filter(i=>i.email.toLowerCase()===email&&
  (i.state==='accepted'||(i.state==='pending'&&Date.parse(i.expires_at)>Date.now())));
assert.ok(existing.length<=1,'Multiple existing invitations; manual inspection required.');
let invitation=existing[0],created=false;
if(!invitation&&send){
  await assert.rejects(access(root+'/send-started.json'),'A prior send attempt exists; inspect, do not retry.');
  await writeFile(root+'/send-started.json',JSON.stringify({at:new Date().toISOString(),email}),{flag:'wx'});
  invitation=await api('invitations',{email,expires_in_days:7});created=true;
}
if(invitation){
  assert.match(invitation.id,/^invitation_[A-Z0-9]+$/i);
  invitation=await api('invitations/'+encodeURIComponent(invitation.id));
}
const evidence={at:new Date().toISOString(),created,invitation:invitation?safe(invitation):null,
  ownerMappingCreated:false,memberAuthChanged:false};
if(invitation?.state==='accepted'){
  assert.match(invitation.accepted_user_id,/^user_[A-Z0-9]+$/i);
  const user=await api('users/'+invitation.accepted_user_id);
  assert.equal(user.id,invitation.accepted_user_id);
  assert.equal(user.email.toLowerCase(),email,'Accepted invitation email differs from approved owner.');
  const factors=await api('users/'+user.id+'/auth_factors?limit=10');
  assert.ok(Array.isArray(factors.data));
  evidence.owner={subject:user.id,emailMatches:true,emailVerified:user.email_verified===true,
    totpFactorCount:factors.data.filter(f=>f.type==='totp').length,
    factorTypes:factors.data.map(f=>f.type),
    factorEnrollmentIsNotPortalSessionProof:true};
}
await writeFile(root+'/status-'+Date.now()+'.json',JSON.stringify(evidence,null,2),{flag:'wx'});
console.log(JSON.stringify(evidence,null,2));
