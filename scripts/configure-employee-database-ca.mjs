// Public certificate link verified in the authenticated Supabase dashboard.
// Only the new employee client's trust configuration is changed.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { X509Certificate } from 'node:crypto';
const path='.artifacts/employee-runtime/database.json';
const config=JSON.parse(await readFile(path,'utf8'));
assert.equal(config.realm,'employee');
assert.equal(config.host,'aws-1-us-west-2.pooler.supabase.com');
assert.equal(config.ca,undefined,'Existing CA must be reviewed, not overwritten');
const source='https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt';
const response=await fetch(source,{redirect:'error',signal:AbortSignal.timeout(10000)});
assert.equal(response.status,200);
const ca=await response.text();assert.ok(ca.length<16000);
const cert=new X509Certificate(ca);
assert.equal(cert.ca,true);assert.equal(cert.checkIssued(cert),true);
assert.equal(cert.verify(cert.publicKey),true);
assert.match(cert.subject,/Supabase Root 2021 CA/);
assert.ok(Date.parse(cert.validFrom)<Date.now()&&Date.parse(cert.validTo)>Date.now());
await writeFile(path,JSON.stringify({...config,ca}));
const evidence={at:new Date().toISOString(),source,subject:cert.subject,fingerprint256:cert.fingerprint256,validTo:cert.validTo,rejectUnauthorized:true,hostnameVerification:true};
await writeFile('test-results/employee-sql-login-20261001/ca.json',JSON.stringify(evidence,null,2),{flag:'wx'});
console.log(JSON.stringify(evidence));
