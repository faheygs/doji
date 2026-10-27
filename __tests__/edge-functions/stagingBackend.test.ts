jest.mock(
  'cloudflare:workers',
  () => ({
    DurableObject: class {
      ctx: unknown;
      env: unknown;
      constructor(ctx: unknown, env: unknown) {
        this.ctx = ctx;
        this.env = env;
      }
    },
  }),
  { virtual: true },
);

import { readFileSync } from 'node:fs';
import worker, { type Env } from '../../infra/doji-orchestrator/src/index';
import staging, {
  DojiEventAlarm,
  OutboxRelayAlarm,
  PushFanoutAlarm,
  DataMaintenanceAlarm,
  HealthMonitor,
} from '../../infra/doji-orchestrator/src/staging';

const env = {
  DOJI_EVENT_ALARM: {} as Env['DOJI_EVENT_ALARM'],
  OUTBOX_RELAY_ALARM: {} as Env['OUTBOX_RELAY_ALARM'],
  PUSH_FANOUT_ALARM: {} as Env['PUSH_FANOUT_ALARM'],
  DATA_MAINTENANCE_ALARM: {} as Env['DATA_MAINTENANCE_ALARM'],
  HEALTH_MONITOR: {} as Env['HEALTH_MONITOR'],
  DOJI_ENVIRONMENT: 'staging',
  SUPABASE_URL: 'https://ohrcupagdoilkwhecict.supabase.co',
  STAGING_BACKEND_ENABLED: 'true',
  SUPABASE_ANON_KEY: 'synthetic',
  ORCHESTRATOR_SECRET: 'synthetic-orchestration',
  OUTBOX_RELAY_SECRET: 'synthetic-relay',
  SCALE_CACHE_VERSION: 'staging-v1',
  ADMIN_PORTAL_ORIGINS: 'https://admin-staging.dojipro.com',
} satisfies Env & { DOJI_ENVIRONMENT: string; STAGING_BACKEND_ENABLED: string };
afterEach(() => jest.restoreAllMocks());

test.each([
  { DOJI_ENVIRONMENT: undefined },
  { DOJI_ENVIRONMENT: 'production' },
  { STAGING_BACKEND_ENABLED: undefined },
  { STAGING_BACKEND_ENABLED: 'false' },
  { SUPABASE_URL: 'https://tvixsmqxotuvyjqzmjla.supabase.co' },
  { SUPABASE_URL: 'https://ohrcupagdoilkwhecict.supabase.co.evil.invalid' },
  { ADMIN_PORTAL_ORIGINS: 'https://admin.dojipro.com' },
  { SCALE_CACHE_VERSION: 'v1' },
  { SUPABASE_ANON_KEY: '' },
  { ORCHESTRATOR_SECRET: '' },
  { OUTBOX_RELAY_SECRET: '' },
  { SENTRY_API_TOKEN: 'unqualified-provider' },
  { SENTRY_DSN: 'unqualified-provider' },
  { STAGING_SENTRY_ENABLED: 'true' },
  { STAGING_SENTRY_ENABLED: 'true', STAGING_SENTRY_DSN: 'https://key@evil.invalid/1' },
])('rejects mixed or incomplete configuration before runtime entry: %j', async (patch) => {
  const bad = { ...env, ...patch };
  const fetch = jest.spyOn(worker, 'fetch');
  const scheduled = jest.spyOn(worker, 'scheduled');
  expect(
    (await staging.fetch(new Request('https://staging.invalid'), bad, {} as ExecutionContext))
      .status,
  ).toBe(503);
  await expect(staging.scheduled({} as ScheduledController, bad)).rejects.toThrow(
    'configuration rejected',
  );
  for (const Alarm of [
    DojiEventAlarm,
    OutboxRelayAlarm,
    PushFanoutAlarm,
    DataMaintenanceAlarm,
    HealthMonitor,
  ]) {
    expect(() => new Alarm({} as DurableObjectState, bad)).toThrow('configuration rejected');
  }
  expect(fetch).not.toHaveBeenCalled();
  expect(scheduled).not.toHaveBeenCalled();
});

test('explicit staging telemetry binding is scoped through requests and every alarm', async () => {
  const dsn = `https://${'a'.repeat(32)}@o123.ingest.us.sentry.io/456`;
  const configured = { ...env, STAGING_SENTRY_ENABLED: 'true', STAGING_SENTRY_DSN: dsn };
  const scoped = { ...configured, SENTRY_DSN: dsn };
  const context = {} as ExecutionContext;
  const controller = {} as ScheduledController;
  const request = new Request('https://staging.invalid');
  const fetch = jest.spyOn(worker, 'fetch').mockResolvedValue(new Response());
  const scheduled = jest.spyOn(worker, 'scheduled').mockResolvedValue(undefined);
  await staging.fetch(request, configured, context);
  await staging.scheduled(controller, configured);
  expect(fetch).toHaveBeenCalledWith(request, scoped, context);
  expect(scheduled).toHaveBeenCalledWith(controller, scoped);
  for (const Alarm of [
    DojiEventAlarm,
    OutboxRelayAlarm,
    PushFanoutAlarm,
    DataMaintenanceAlarm,
    HealthMonitor,
  ]) {
    expect(Reflect.get(new Alarm({} as DurableObjectState, configured), 'env')).toEqual(scoped);
  }
  expect(configured).not.toHaveProperty('SENTRY_DSN');
});

test('disabling staging telemetry leaves backend available without exporting its retained key', async () => {
  const configured = { ...env, STAGING_SENTRY_ENABLED: 'false', STAGING_SENTRY_DSN: 'retained-secret' };
  const fetch = jest.spyOn(worker, 'fetch').mockResolvedValue(new Response());
  expect((await staging.fetch(new Request('https://staging.invalid'), configured, {} as ExecutionContext)).status).toBe(200);
  expect(fetch.mock.calls[0][1].SENTRY_DSN).toBeUndefined();
  for (const Alarm of [DojiEventAlarm, OutboxRelayAlarm, PushFanoutAlarm, DataMaintenanceAlarm, HealthMonitor]) {
    expect(Reflect.get(new Alarm({} as DurableObjectState, configured), 'env').SENTRY_DSN).toBeUndefined();
  }
});

test('valid staging requests and all alarms reuse the production implementation', async () => {
  const context = {} as ExecutionContext;
  const request = new Request('https://staging.invalid');
  const controller = {} as ScheduledController;
  const response = new Response('synthetic');
  const fetch = jest.spyOn(worker, 'fetch').mockResolvedValue(response);
  const scheduled = jest.spyOn(worker, 'scheduled').mockResolvedValue(undefined);
  expect(await staging.fetch(request, env, context)).toBe(response);
  await staging.scheduled(controller, env);
  expect(fetch).toHaveBeenCalledWith(request, env, context);
  expect(scheduled).toHaveBeenCalledWith(controller, env);
  for (const Alarm of [
    DojiEventAlarm,
    OutboxRelayAlarm,
    PushFanoutAlarm,
    DataMaintenanceAlarm,
    HealthMonitor,
  ]) {
    expect(new Alarm({} as DurableObjectState, env)).toBeInstanceOf(Alarm);
  }
});

test('staging owns all five namespaces and never references production Worker storage', () => {
  const config = JSON.parse(readFileSync('infra/doji-orchestrator/wrangler.staging.jsonc', 'utf8'));
  expect(config.name).toBe('doji-orchestrator-staging');
  expect(config.main).toBe('src/staging.ts');
  expect(config.vars.SUPABASE_URL).toBe(env.SUPABASE_URL);
  expect(config.durable_objects.bindings).toHaveLength(5);
  for (const binding of config.durable_objects.bindings) {
    expect(Object.keys(binding).sort()).toEqual(['class_name', 'name']);
  }
  expect(
    config.migrations
      .flatMap((item: { new_sqlite_classes: string[] }) => item.new_sqlite_classes)
      .sort(),
  ).toEqual(
    config.durable_objects.bindings.map((item: { class_name: string }) => item.class_name).sort(),
  );
  expect(config.triggers.crons).toEqual([]);
  expect(config.vars.STAGING_BACKEND_ENABLED).toBe('true');
  expect(config.routes).toBeUndefined();
});
