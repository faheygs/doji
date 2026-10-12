import test from 'node:test';
import assert from 'node:assert/strict';
import {renderDojiEmail} from '../supabase/functions/_shared/doji-email.ts';
import {renderEmployeeVerificationEmail} from '../supabase/functions/_shared/employee-email.ts';
const input={preheader:'Preview',eyebrow:'Notice',title:'A title',summary:'A summary',facts:[{label:'Case',value:'reference',monospace:true}],actions:[{label:'Open',href:'https://admin.dojipro.com/'}]};
test('shared templates use the actual logo and button actions with readable facts',()=>{
 const mail=renderDojiEmail(input);
 assert.match(mail.html,/alt="Doji logo"/);
 assert.match(mail.html,/font-family:monospace/);
 assert.match(mail.html,/>Open<\/a>/);
 assert.match(mail.text,/Case: reference/);
 assert.match(mail.text,/Open: https:\/\/admin.dojipro.com\//);
});
test('all shared slots escape content and actions reject unsafe URLs',()=>{
 const value='<script>bad</script> & "bad"';
 for(const href of ['javascript:alert(1)','data:text/html,bad','https://user:pass@example.com/','https://example.com/\n']){
  const mail=renderDojiEmail({...input,eyebrow:value,statusLabel:value,reference:value,footerNote:value,sections:[{heading:value,body:value,bullets:[value]}],actions:[{label:'Open',href}]});
  assert.doesNotMatch(mail.html,/<script>/);
  assert.match(mail.html,/href="#"/);
  assert.match(mail.html,/&lt;script&gt;/);
 }
});
test('legacy employee presentation shares brand without losing verification destination or plaintext',()=>{
 const action='https://auth.example.test/auth/v1/verify?token=synthetic&type=signup';
 const mail=renderEmployeeVerificationEmail('<work>@example.test',action,'https://admin.dojipro.com');
 assert.match(mail.html,/DOJI WORKSPACE/);assert.match(mail.html,/alt="Doji logo"/);
 assert.match(mail.html,/&lt;work&gt;/);assert.ok(mail.html.includes(action.replace('&','&amp;')));
 assert.match(mail.text,/Verify my work email/);assert.ok(mail.text.includes(action));
});
