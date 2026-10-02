import test from 'node:test';
import assert from 'node:assert/strict';
import {employeeSetupReturn} from '../infra/portal-identity-candidate/employee-setup-return.mjs';
const url='https://admin.dojipro.com/identity/setup-complete';
test('provider code is stripped, never echoed or used as employee authority',async()=>{
 const r=employeeSetupReturn(new Request(url+'?code=synthetic&state=synthetic'));
 assert.equal(r.status,303);assert.equal(r.headers.get('location'),url);
 assert.equal(r.headers.get('referrer-policy'),'no-referrer');assert.equal(await r.text(),'');
});
test('return page makes no sign-in claim and is no-store with no executable content',async()=>{
 const r=employeeSetupReturn(new Request(url)),body=await r.text();
 assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'no-store');
 assert.match(body,/before enabling portal access/);assert.doesNotMatch(body,/<form/);
 assert.match(body,/<script src="\/identity\/setup-return.js"><\/script>/);
 assert.match(r.headers.get('content-security-policy'),/default-src 'none'/);
});
test('callback cannot be posted to, or enabled on another origin',()=>{
 assert.equal(employeeSetupReturn(new Request(url,{method:'POST',body:'synthetic'})).status,405);
 assert.equal(employeeSetupReturn(new Request(url.replace('admin.','business.'))),null);
});
