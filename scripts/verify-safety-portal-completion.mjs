// Exact synthetic case only; no writes or private status secrets in evidence.
import assert from 'node:assert/strict';
import {cli,save} from './prepare-safety-launch.mjs';
const id='218161a8-a68a-4542-a471-7d2662cbe7c4';
const result=cli(['db','query',`begin read only;set local statement_timeout='8s';
select jsonb_build_object('verified_at',clock_timestamp(),'case',(
 select jsonb_build_object('id',c.id,'state',c.state,'queue',c.queue,'revision',c.revision,
 'closed_at',c.closed_at,'report_id',c.report_id,'synthetic',c.request->>'name'='Doji synthetic launch verification',
 'public_message',c.public_message,'alert_state',a.state,'delivery_status',a.provider_delivery_status)
 from public.safety_removal_cases c join public.safety_removal_alerts a on a.case_id=c.id where c.id='${id}'),
 'history',(select jsonb_agg(jsonb_build_object('action',action,'occurred_at',occurred_at,'staff_actor_present',actor_id is not null) order by occurred_at)
 from public.safety_removal_history where case_id='${id}')) checks;rollback;`,'--linked','--output-format','json']).rows[0].checks;
assert.equal(result.case.synthetic,true);
assert.equal(result.case.state,'not_actionable');
assert.equal(result.case.report_id,null);
assert.equal(result.case.delivery_status,'delivered');
assert.ok(result.case.closed_at);
assert.ok(result.history.some(h=>h.action==='not_actionable'&&h.staff_actor_present));
result.browser={authenticatedStaffDrawerVerified:true,normalConfirmationUsed:true,publicStatus:'Review completed',publicMessageVerified:true,privateCodeRecorded:false};
await save('portal-e2e-complete.json',result);
console.log(JSON.stringify(result));
