// Owner-approved free bot-protection widget. Dedicated credential travels only
// from Cloudflare to the matching Supabase secret, never disk or tool output.
import assert from 'node:assert/strict';
import {cf,cli,ref,save} from './prepare-safety-launch.mts';
import { evidenceRecord } from './release-evidence.mts';
assert.equal(process.argv[2],'--configure-free-widget');
const name='Doji Safety and Removal Center';
const list=await cf('/challenges/widgets');
assert.ok(Array.isArray(list)&&list.length<20);
const existing=list.map(evidenceRecord).filter(v=>v.name===name);assert.ok(existing.length<=1);
let widget;
try{
 const previous=existing[0];
 widget=evidenceRecord(previous?await cf(`/challenges/widgets/${previous.sitekey}`):await cf('/challenges/widgets',{method:'POST',body:JSON.stringify({name,domains:['dojipro.com'],mode:'managed',bot_fight_mode:false,clearance_level:'no_clearance'})}));
 assert.equal(widget.name,name);assert.equal(widget.mode,'managed');assert.deepEqual(widget.domains,['dojipro.com']);assert.ok(widget.secret&&widget.sitekey);
 cli(['secrets','set',`SAFETY_TURNSTILE_SECRET=${widget.secret}`,'SAFETY_REMOVAL_ORIGIN=https://dojipro.com','SAFETY_REMOVAL_ENABLED=false','--project-ref',ref],false);
 await save('turnstile-configured.json',{at:new Date().toISOString(),name,sitekey:widget.sitekey,domains:widget.domains,mode:widget.mode,publicEnabled:false});
 console.log('Free scoped widget configured; server credential saved securely; public acceptance remains disabled.');
}catch(e){console.error(e instanceof Error ? e.message : 'Widget configuration failed');process.exitCode=1;}
