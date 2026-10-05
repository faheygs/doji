// Adapter for the existing locally installed EAS CLI. Importing this file does
// not load credentials or contact Expo; only explicit reader creation does so.
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { evidenceRecord, evidenceAt, evidenceArray, evidenceNumber, evidenceStrings } from './release-evidence.mts';
const require = createRequire(import.meta.url);
const base = 'C:/Users/gfahe/AppData/Roaming/npm/node_modules/eas-cli/build';
type ModuleLoader = (path: string) => unknown;
function method(value: unknown, key: string): (...args: unknown[]) => unknown {
  const object=evidenceRecord(value),fn=object[key];
  assert.ok(typeof fn==='function',`Installed EAS CLI is missing ${key}`);
  return (...args)=>Reflect.apply(fn,object,args);
}
function text(value: unknown): string { assert.ok(typeof value==='string','Invalid EAS status field');return value; }
function nullableText(value: unknown): string|null|undefined {
  if(value===null||value===undefined)return value;
  return text(value);
}
export function decodeEasSubmission(value: unknown) {
  const row=evidenceRecord(value);
  return {id:text(row.id),status:text(row.status),error:row.error};
}
export function decodeEasBuild(value: unknown) {
  const row=evidenceRecord(value),project=evidenceRecord(row.project);
  const artifacts=row.artifacts==null?null:evidenceRecord(row.artifacts);
  return {
    ...decodeEasSubmission(row),project:{id:text(project.id)},platform:text(row.platform),
    appVersion:nullableText(row.appVersion),appBuildVersion:nullableText(row.appBuildVersion),
    createdAt:nullableText(row.createdAt),completedAt:nullableText(row.completedAt),queuePosition:row.queuePosition,
    artifacts:artifacts?{applicationArchiveUrl:nullableText(artifacts.applicationArchiveUrl),buildUrl:nullableText(artifacts.buildUrl)}:null,
  };
}
export function createEasReadClient(load: ModuleLoader = require) {
  const Session=evidenceRecord(load(`${base}/user/SessionManager`)).default;
  assert.ok(typeof Session==='function','Installed EAS session adapter unavailable');
  const session: unknown=Reflect.construct(Session,[{setActor(){}}]);
  const client=method(load(`${base}/commandUtils/context/contextUtils/createGraphqlClient`),'createGraphqlClient')({
    accessToken:method(session,'getAccessToken')(),sessionSecret:method(session,'getSessionSecret')(),
  });
  const buildQuery=evidenceRecord(load(`${base}/graphql/queries/BuildQuery`)).BuildQuery;
  const submissionQuery=evidenceRecord(load(`${base}/graphql/queries/SubmissionQuery`)).SubmissionQuery;
  return {
    async build(id: string) {return decodeEasBuild(await method(buildQuery,'byIdAsync')(client,id,{useCache:false}));},
    async buildAssessment(id:string) {
      const row=evidenceRecord(await method(buildQuery,'byIdAsync')(client,id,{useCache:false}));
      return {...decodeEasBuild(row),buildProfile:text(row.buildProfile),distribution:text(row.distribution),logFiles:evidenceStrings(row.logFiles)};
    },
    async submission(id: string) {return decodeEasSubmission(await method(submissionQuery,'byIdAsync')(client,id,{useCache:false}));},
    async buildCreditUsage(accountName: string) {
      const query=evidenceRecord(load(`${base}/graphql/queries/AccountQuery`)).AccountQuery;
      const account=evidenceRecord(await method(query,'getByNameAsync')(client,accountName));
      const usage=evidenceRecord(await method(query,'getUsageForOverageWarningAsync')(client,text(account.id),new Date()));
      const metrics=evidenceArray(evidenceAt(usage,'usageMetrics','EAS_BUILD').planMetrics);
      const metric=metrics.find(row=>row.serviceMetric==='BUILDS');
      assert.ok(metric,'Missing included build credit metric');
      return {metric:{limit:evidenceNumber(metric.limit),value:evidenceNumber(metric.value)},plan:evidenceAt(usage,'subscription').name};
    },
  };
}
