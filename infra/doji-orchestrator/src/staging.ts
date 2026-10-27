import worker, {
  DojiEventAlarm as EventAlarm,
  OutboxRelayAlarm as RelayAlarm,
  PushFanoutAlarm as FanoutAlarm,
  DataMaintenanceAlarm as MaintenanceAlarm,
  HealthMonitor as Monitor,
  type Env,
} from './index';

type StagingEnv = Env & {
  STAGING_BACKEND_ENABLED?: string;
  STAGING_SENTRY_ENABLED?: string;
  STAGING_SENTRY_DSN?: string;
};

// Validate on every entry, including restored alarms, before any upstream I/O.
function stagingEnvironment(env: StagingEnv): StagingEnv {
  if (
    env.DOJI_ENVIRONMENT !== 'staging' ||
    env.STAGING_BACKEND_ENABLED !== 'true' ||
    env.SUPABASE_URL !== 'https://ohrcupagdoilkwhecict.supabase.co' ||
    env.ADMIN_PORTAL_ORIGINS !== 'https://admin-staging.dojipro.com' ||
    env.SCALE_CACHE_VERSION !== 'staging-v1' ||
    !env.SUPABASE_ANON_KEY ||
    !env.ORCHESTRATOR_SECRET ||
    !env.OUTBOX_RELAY_SECRET ||
    env.SENTRY_API_TOKEN ||
    env.SENTRY_DSN
  )
    throw new Error('Staging backend configuration rejected');
  if (env.STAGING_SENTRY_ENABLED !== 'true') {
    return env;
  }
  // Separate, explicitly approved binding; never inherit the production DSN.
  if (
    !/^https:\/\/[a-f0-9]{32}@o\d+\.ingest\.(?:(?:us|de)\.)?sentry\.io\/\d+$/.test(
      env.STAGING_SENTRY_DSN || '',
    )
  )
    throw new Error('Staging backend configuration rejected');
  return { ...env, SENTRY_DSN: env.STAGING_SENTRY_DSN };
}

// Reuse production implementations; only bindings and environment fencing differ.
export class DojiEventAlarm extends EventAlarm {
  constructor(ctx: DurableObjectState, env: StagingEnv) {
    super(ctx, stagingEnvironment(env));
  }
}
export class OutboxRelayAlarm extends RelayAlarm {
  constructor(ctx: DurableObjectState, env: StagingEnv) {
    super(ctx, stagingEnvironment(env));
  }
}
export class PushFanoutAlarm extends FanoutAlarm {
  constructor(ctx: DurableObjectState, env: StagingEnv) {
    super(ctx, stagingEnvironment(env));
  }
}
export class DataMaintenanceAlarm extends MaintenanceAlarm {
  constructor(ctx: DurableObjectState, env: StagingEnv) {
    super(ctx, stagingEnvironment(env));
  }
}
export class HealthMonitor extends Monitor {
  constructor(ctx: DurableObjectState, env: StagingEnv) {
    super(ctx, stagingEnvironment(env));
  }
}

export default {
  async fetch(request: Request, env: StagingEnv, context: ExecutionContext) {
    let scoped: StagingEnv;
    try {
      scoped = stagingEnvironment(env);
    } catch {
      return new Response('Staging backend unavailable', {
        status: 503,
        headers: { 'cache-control': 'no-store' },
      });
    }
    return worker.fetch(request, scoped, context);
  },
  async scheduled(controller: ScheduledController, env: StagingEnv) {
    return worker.scheduled(controller, stagingEnvironment(env));
  },
} satisfies ExportedHandler<StagingEnv>;
