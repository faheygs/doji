// These contracts concern disposable local test containers only, never live DBs.
export interface MemorySql {
  exec(sql:string):Promise<unknown>;
  query(sql:string,params?:unknown[]):Promise<{rows:Record<string,unknown>[]} >;
  close():Promise<void>;
}
export interface TestRoom {
  name: string;
  inspect(): unknown;
  sql(source: string, database?: string): string;
  call(args: string[], input?: string): string;
}
export interface SuiteResult {
  suite: string;
  status: 'failed' | 'passed';
  output?: string;
}
export interface DatabaseRun {
  startedAt: string;
  status: 'failed' | 'passed';
  finishedAt?: string;
  error?: string;
  cleanupError?: string;
  image?: string;
  container?: string;
  images?: { name: string; id: unknown; digests: unknown }[];
  migrations?: { file: string; sha256: string }[];
  tests?: { passed: string[]; failures: string[]; extended: SuiteResult[] };
  concurrency?: string[];
}
export function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
export function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
export function errorOutput(error: unknown, stream: 'stdout' | 'stderr'): string {
  return record(error) && error[stream] != null ? String(error[stream]) : message(error);
}
export function firstRecord(value: unknown): Record<string, unknown> {
  if (!Array.isArray(value) || !record(value[0])) throw Error('Missing local engine record');
  return value[0];
}

export function offlineContainer(
  value: unknown,
): Record<string, unknown> & {
  HostConfig: { NetworkMode: string; PortBindings: Record<string, unknown> };
} {
  const info = firstRecord(value);
  if (!record(info.HostConfig)) throw Error('Missing local container host configuration');
  const ports = info.HostConfig.PortBindings ?? {};
  if (info.HostConfig.NetworkMode !== 'none' || !record(ports) || Object.keys(ports).length !== 0)
    throw Error('Network-disabled container without published ports required');
  return { ...info, HostConfig: { ...info.HostConfig, NetworkMode: 'none', PortBindings: ports } };
}
