import test from 'node:test';
import assert from 'node:assert/strict';
import {createEasReadClient,decodeEasBuild,decodeEasSubmission} from './eas-read-client.mts';
test('EAS adapter uses only injected uncached exact-id reads, never builds or submits',async()=>{
  const calls: unknown[][]=[];
  const client={synthetic:true};
  const build={id:'exact-build',status:'FINISHED',platform:'ANDROID',project:{id:'project'},appVersion:'1.0.8',appBuildVersion:'28',artifacts:{buildUrl:'https://example.test/exact.aab'}};
  const query={async byIdAsync(...args: unknown[]){calls.push(args);return build;}};
  const reader=createEasReadClient(path=>{
    if(path.endsWith('/SessionManager'))return {default:class {getAccessToken(){return 'synthetic';}getSessionSecret(){return null;}}};
    if(path.endsWith('/createGraphqlClient'))return {createGraphqlClient(auth: unknown){assert.deepEqual(auth,{accessToken:'synthetic',sessionSecret:null});return client;}};
    if(path.endsWith('/BuildQuery'))return {BuildQuery:query};
    if(path.endsWith('/SubmissionQuery'))return {SubmissionQuery:{async byIdAsync(...args: unknown[]){calls.push(args);return {id:'exact-upload',status:'FINISHED'};}}};
    throw Error('Unexpected module');
  });
  assert.equal((await reader.build('exact-build')).appBuildVersion,'28');
  assert.equal((await reader.submission('exact-upload')).id,'exact-upload');
  assert.deepEqual(calls,[[client,'exact-build',{useCache:false}],[client,'exact-upload',{useCache:false}]]);
});
test('EAS response decoding rejects malformed fields and preserves optional absence',()=>{
  for(const value of [null,[],{id:1,status:'FINISHED'},{id:'x',status:null}])assert.throws(()=>decodeEasSubmission(value));
  const row={id:'x',status:'IN_PROGRESS',platform:'IOS',project:{id:'p'},appVersion:null,appBuildVersion:undefined};
  assert.equal(decodeEasBuild(row).artifacts,null);
  assert.equal(decodeEasBuild(row).appVersion,null);
  assert.throws(()=>decodeEasBuild({...row,artifacts:{buildUrl:1}}));
  assert.throws(()=>createEasReadClient(()=>({})));
});

test('included-credit adapter validates the exact account and finite metric without a provider request',async()=>{
  let metric:unknown={serviceMetric:'BUILDS',limit:1000,value:300};
  const calls:unknown[][]=[];
  const reader=createEasReadClient(path=>{
    if(path.endsWith('/SessionManager'))return {default:class {getAccessToken(){return 'synthetic';}getSessionSecret(){return null;}}};
    if(path.endsWith('/createGraphqlClient'))return {createGraphqlClient(){return 'synthetic-client';}};
    if(path.endsWith('/BuildQuery'))return {BuildQuery:{}};
    if(path.endsWith('/SubmissionQuery'))return {SubmissionQuery:{}};
    if(path.endsWith('/AccountQuery'))return {AccountQuery:{
      async getByNameAsync(...args:unknown[]){calls.push(args);return {id:'synthetic-account'};},
      async getUsageForOverageWarningAsync(...args:unknown[]){calls.push(args);return {usageMetrics:{EAS_BUILD:{planMetrics:[metric]}},subscription:{name:'synthetic-plan'}};},
    }};
    throw Error('Unexpected module');
  });
  assert.deepEqual(await reader.buildCreditUsage('fixture'),{metric:{limit:1000,value:300},plan:'synthetic-plan'});
  assert.deepEqual(calls[0],['synthetic-client','fixture']);
  assert.deepEqual(calls[1]?.slice(0,2),['synthetic-client','synthetic-account']);
  assert.ok(calls[1]?.[2] instanceof Date);
  for(const invalid of [null,{}, {serviceMetric:'OTHER',limit:1,value:0},{serviceMetric:'BUILDS',limit:'1000',value:300},{serviceMetric:'BUILDS',limit:1000,value:NaN}]){
    metric=invalid;await assert.rejects(reader.buildCreditUsage('fixture'));
  }
});

test('assessment reads validate log references through the injected exact-build adapter',async()=>{
  let logFiles:unknown=['https://logs.example.test/one'];
  const calls:unknown[][]=[];
  const reader=createEasReadClient(path=>{
    if(path.endsWith('/SessionManager'))return {default:class {getAccessToken(){return null;}getSessionSecret(){return 'fixture';}}};
    if(path.endsWith('/createGraphqlClient'))return {createGraphqlClient(){return 'fixture-client';}};
    if(path.endsWith('/SubmissionQuery'))return {SubmissionQuery:{}};
    if(path.endsWith('/BuildQuery'))return {BuildQuery:{async byIdAsync(...args:unknown[]){calls.push(args);return {id:'assessment-build',status:'FINISHED',platform:'IOS',project:{id:'project'},buildProfile:'production',distribution:'STORE',logFiles};}}};
    throw Error('Unexpected module');
  });
  const build=await reader.buildAssessment('assessment-build');
  assert.equal(build.buildProfile,'production');assert.equal(build.distribution,'STORE');assert.deepEqual(build.logFiles,logFiles);
  assert.deepEqual(calls,[['fixture-client','assessment-build',{useCache:false}]]);
  for(const invalid of [null,{},['valid',3]]){logFiles=invalid;await assert.rejects(reader.buildAssessment('assessment-build'));}
});
