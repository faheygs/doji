import { DurableObject } from 'cloudflare:workers';
import { captureWorkerException } from './sentry';
import { handleCommandGateway } from './command-gateway';
import {
  checkOperationalHealth,
  sendOperationalAlert,
  type EventAlarmRepair,
} from './operational-health';

interface Env {
  DOJI_EVENT_ALARM: DurableObjectNamespace<DojiEventAlarm>;
  OUTBOX_RELAY_ALARM: DurableObjectNamespace<OutboxRelayAlarm>;
  PUSH_FANOUT_ALARM: DurableObjectNamespace<PushFanoutAlarm>;
  DATA_MAINTENANCE_ALARM: DurableObjectNamespace<DataMaintenanceAlarm>;
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  ORCHESTRATOR_SECRET: string;
  OUTBOX_RELAY_SECRET: string;
  SENTRY_DSN?: string;
}

type AlarmState = {
  dailyEventId: string;
  phase: 'prelive' | 'activate' | 'close';
  firesAt: string;
  closesAt?: string;
  chainNext: boolean;
  closeAction?: 'close' | 'close_targeted';
};

type PushFanoutMessage = { dailyEventId: string; shard: number };

const OUTBOX_WAKE_COALESCE_MS = 250;
const OUTBOX_MAX_PAGES_PER_ALARM = 8;
const PUSH_FANOUT_CONCURRENCY = 8;
const PUSH_FANOUT_LIFETIME_MS = 2 * 60 * 1000;
const UPSTREAM_TIMEOUT_MS = 12_000;

function fetchUpstream(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  return fetch(input, {
    ...init,
    signal: init.signal ?? AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
  });
}

async function wakeDomainRelayNow(env: Env): Promise<void> {
  const id = env.OUTBOX_RELAY_ALARM.idFromName('singleton');
  const response = await env.OUTBOX_RELAY_ALARM.get(id).fetch('https://alarm.internal/wake', {
    method: 'POST',
  });
  if (!response.ok) throw new Error(`Scheduling outbox relay failed: ${response.status}`);
}

async function enqueueDojiPushFanout(env: Env, dailyEventId: string): Promise<void> {
  const id = env.PUSH_FANOUT_ALARM.idFromName(dailyEventId);
  const response = await env.PUSH_FANOUT_ALARM.get(id).fetch('https://push.internal/start', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ dailyEventId }),
  });
  if (!response.ok) throw new Error(`Scheduling Doji push fanout failed: ${response.status}`);
}

async function repairEventAlarms(env: Env, repairs: EventAlarmRepair[]): Promise<void> {
  const outcomes = await Promise.allSettled(repairs.map(async (repair) => {
    const id = env.DOJI_EVENT_ALARM.idFromName(repair.dailyEventId);
    const response = await env.DOJI_EVENT_ALARM.get(id).fetch(
      `https://alarm.internal/events/${repair.dailyEventId}/repair`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(repair),
      },
    );
    if (!response.ok) {
      throw new Error(`Repairing event alarm failed: ${response.status}`);
    }
  }));
  const rejected = outcomes.filter((outcome) => outcome.status === 'rejected');
  if (rejected.length > 0) {
    throw new Error(`${rejected.length} event alarm repair(s) failed`);
  }
}

async function listDojiPushFanoutShards(env: Env, dailyEventId: string): Promise<number[]> {
  const response = await fetchUpstream(`${env.SUPABASE_URL}/functions/v1/fanout-doji-push`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-outbox-secret': env.OUTBOX_RELAY_SECRET,
    },
    body: JSON.stringify({ dailyEventId }),
  });
  const body = await response.text();
  if (!response.ok) {
    throw new Error(`Listing Doji push shards failed: ${response.status} ${body}`);
  }
  const parsed = JSON.parse(body) as { shards?: unknown };
  if (!Array.isArray(parsed.shards)) throw new Error('Invalid Doji push shard response');
  return parsed.shards.filter(
    (shard): shard is number => Number.isInteger(shard) && shard >= 0 && shard <= 127,
  );
}

async function processPushFanout(
  env: Env,
  message: PushFanoutMessage,
): Promise<{ continued: boolean; retryAfterSeconds?: number }> {
  const response = await fetchUpstream(`${env.SUPABASE_URL}/functions/v1/fanout-doji-push`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-outbox-secret': env.OUTBOX_RELAY_SECRET,
    },
    body: JSON.stringify(message),
  });
  const body = await response.text();
  if (!response.ok) {
    let retryAfterSeconds: number | undefined;
    try {
      const parsed = JSON.parse(body) as { retryAfterSeconds?: number };
      retryAfterSeconds = parsed.retryAfterSeconds;
    } catch {
      // The HTTP status remains the retry signal.
    }
    const error = new Error(`Doji push fanout failed: ${response.status} ${body}`);
    Object.assign(error, { retryAfterSeconds });
    throw error;
  }
  return JSON.parse(body) as { continued: boolean; retryAfterSeconds?: number };
}

async function orchestrateDoji<T>(
  env: Env,
  action: 'prelive' | 'activate' | 'close' | 'close_targeted',
  dailyEventId: string,
): Promise<T> {
  const response = await fetchUpstream(`${env.SUPABASE_URL}/functions/v1/orchestrate-doji`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-orchestrator-secret': env.ORCHESTRATOR_SECRET,
    },
    body: JSON.stringify({ action, dailyEventId }),
  });
  if (!response.ok) {
    throw new Error(`orchestrate-doji failed: ${response.status} ${await response.text()}`);
  }
  return response.json() as Promise<T>;
}

async function prepareNextDoji(env: Env): Promise<void> {
  const response = await fetchUpstream(`${env.SUPABASE_URL}/functions/v1/schedule-daily-challenge`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-orchestrator-secret': env.ORCHESTRATOR_SECRET,
    },
    body: JSON.stringify({ forceNextDay: true }),
  });
  if (!response.ok) {
    throw new Error(`Preparing the next Doji failed: ${response.status} ${await response.text()}`);
  }
}

async function runDataMaintenance(env: Env): Promise<{ hasMore: boolean }> {
  const response = await fetchUpstream(`${env.SUPABASE_URL}/functions/v1/run-data-maintenance`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-outbox-secret': env.OUTBOX_RELAY_SECRET,
    },
    body: '{}',
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`Data maintenance failed: ${response.status} ${body}`);
  const result = JSON.parse(body) as { hasMore?: boolean };
  return { hasMore: result.hasMore === true };
}

async function scheduleDataMaintenance(env: Env): Promise<void> {
  const id = env.DATA_MAINTENANCE_ALARM.idFromName('singleton');
  const response = await env.DATA_MAINTENANCE_ALARM.get(id).fetch(
    'https://maintenance.internal/wake',
    { method: 'POST' },
  );
  if (!response.ok) throw new Error(`Scheduling data maintenance failed: ${response.status}`);
}

export class DojiEventAlarm extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
  }

  async fetch(request: Request): Promise<Response> {
    if (request.method !== 'PUT' && request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }
    const input = await request.json<{
      dailyEventId: string;
      firesAt: string;
      phase?: 'prelive' | 'activate' | 'close';
      closesAt?: string;
      chainNext?: boolean;
      closeAction?: 'close' | 'close_targeted';
    }>();
    const phase = input.phase ?? 'prelive';
    const alarmAt =
      phase === 'close'
        ? input.closesAt
        : phase === 'prelive'
          ? new Date(Date.parse(input.firesAt) - 20 * 60 * 1000).toISOString()
          : input.firesAt;
    const alarmTime = alarmAt ? Date.parse(alarmAt) : Number.NaN;
    if (!input.dailyEventId || !Number.isFinite(alarmTime)) {
      return new Response('Invalid event alarm', { status: 400 });
    }

    const existing = await this.ctx.storage.get<AlarmState>('event');
    if (
      existing?.dailyEventId === input.dailyEventId &&
      existing.phase === phase &&
      existing.closesAt === input.closesAt
    ) {
      // Durable Object state can survive a failed/consumed alarm. Re-registering
      // the same phase must therefore repair the alarm, not only return state.
      await this.ctx.storage.setAlarm(Math.max(Date.now(), alarmTime));
      return Response.json(existing);
    }

    const state: AlarmState = {
      dailyEventId: input.dailyEventId,
      phase,
      firesAt: input.firesAt,
      closesAt: input.closesAt,
      chainNext: input.chainNext ?? phase !== 'close',
      closeAction: input.closeAction,
    };
    await this.ctx.storage.put('event', state);
    await this.ctx.storage.setAlarm(Math.max(Date.now(), alarmTime));
    return Response.json(state);
  }

  async alarm(): Promise<void> {
    const state = await this.ctx.storage.get<AlarmState>('event');
    if (!state) return;

    if (state.phase === 'prelive') {
      await orchestrateDoji(this.env, 'prelive', state.dailyEventId);
      await wakeDomainRelayNow(this.env);
      const next: AlarmState = { ...state, phase: 'activate' };
      await this.ctx.storage.put('event', next);
      await this.ctx.storage.setAlarm(Math.max(Date.now(), Date.parse(state.firesAt)));
      return;
    }

    if (state.phase === 'activate') {
      const activated = await orchestrateDoji<{
        activated_at: string;
        closes_at: string;
      }>(this.env, 'activate', state.dailyEventId);
      await wakeDomainRelayNow(this.env);
      // Durable fanout seeding is idempotent at the database delivery-key and
      // shard-lease boundaries. If this alarm retries after partial progress,
      // duplicate work cannot produce duplicate user notifications.
      await enqueueDojiPushFanout(this.env, state.dailyEventId);
      const next: AlarmState = {
        ...state,
        phase: 'close',
        closesAt: activated.closes_at,
      };
      await this.ctx.storage.put('event', next);
      await this.ctx.storage.setAlarm(Math.max(Date.now(), Date.parse(activated.closes_at)));
      return;
    }

    await orchestrateDoji<number>(this.env, state.closeAction ?? 'close', state.dailyEventId);
    if (state.chainNext !== false) {
      // Chain the next one-shot alarm from the production event only. Targeted
      // test events close independently and never alter the production chain.
      // Prepare the next occurrence before the relay wake: realtime delivery is
      // recoverable, but a failed wake must never interrupt the daily event chain.
      await prepareNextDoji(this.env);
    }
    await wakeDomainRelayNow(this.env);
    this.ctx.waitUntil(
      scheduleDataMaintenance(this.env).catch((error) => {
        console.error('Non-critical data maintenance failed', error);
      }),
    );
    await this.ctx.storage.delete('event');
  }
}

type RelayAlarmState = { nextWakeAt: string };

export class OutboxRelayAlarm extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
  }

  private async schedule(nextWakeAt: string): Promise<void> {
    const wakeTime = Date.parse(nextWakeAt);
    if (!Number.isFinite(wakeTime)) throw new Error('Invalid outbox relay wake time');
    const existing = await this.ctx.storage.get<RelayAlarmState>('wake');
    if (existing && Date.parse(existing.nextWakeAt) <= wakeTime) return;
    await this.ctx.storage.put('wake', { nextWakeAt });
    await this.ctx.storage.setAlarm(Math.max(Date.now(), wakeTime));
  }

  async fetch(request: Request): Promise<Response> {
    if (request.method === 'POST') {
      await this.schedule(new Date(Date.now() + OUTBOX_WAKE_COALESCE_MS).toISOString());
      return Response.json({ scheduled: true });
    }
    if (request.method !== 'PUT') return new Response('Method not allowed', { status: 405 });
    const input = await request.json<RelayAlarmState>();
    await this.schedule(input.nextWakeAt);
    return Response.json({ scheduled: true, nextWakeAt: input.nextWakeAt });
  }

  async alarm(): Promise<void> {
    await this.ctx.storage.delete('wake');
    try {
      for (let page = 0; page < OUTBOX_MAX_PAGES_PER_ALARM; page += 1) {
        const result = await relayResult(await relayDomainEvents(this.env));
        if (result.hasMore) continue;
        await this.ctx.storage.delete('failures');
        await scheduleRelayWake(this.env, result.nextWakeAt);
        return;
      }
      await this.schedule(new Date().toISOString());
    } catch (error) {
      const failures = (await this.ctx.storage.get<number>('failures') ?? 0) + 1;
      await this.ctx.storage.put('failures', failures);
      if (failures === 10) {
        await Promise.allSettled([
          captureWorkerException(this.env.SENTRY_DSN, 'domain_relay_repeated_failure', error, {
            failures,
          }),
          sendOperationalAlert(this.env, 'domain-relay-repeated-failure', {
            failures,
            error: error instanceof Error ? error.message : String(error),
          }),
        ]);
      }
      const delayMs = Math.min(30_000, 1_000 * 2 ** Math.min(failures - 1, 5));
      await this.schedule(new Date(Date.now() + delayMs).toISOString());
    }
  }
}

type PushFanoutTask = {
  shard: number;
  attempts: number;
  availableAt: number;
};

type PushFanoutState = {
  dailyEventId: string;
  expiresAt: number;
  tasks: PushFanoutTask[];
  alerted: boolean;
};

/**
 * Delivers one Doji launch without paying a queue operation for every shard.
 * Postgres owns leases and provider delivery keys; this object only advances the
 * bounded list of shards that actually contain eligible recipients.
 */
export class PushFanoutAlarm extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
  }

  async fetch(request: Request): Promise<Response> {
    if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
    const input = await request.json<{ dailyEventId?: string }>();
    if (!input.dailyEventId) return new Response('Missing dailyEventId', { status: 400 });

    const existing = await this.ctx.storage.get<PushFanoutState>('fanout');
    if (existing?.dailyEventId === input.dailyEventId && existing.tasks.length > 0) {
      await this.ctx.storage.setAlarm(Date.now());
      return Response.json({ scheduled: true, shards: existing.tasks.length });
    }

    const shards = await listDojiPushFanoutShards(this.env, input.dailyEventId);
    if (shards.length === 0) {
      await this.ctx.storage.delete('fanout');
      return Response.json({ scheduled: false, shards: 0 });
    }
    const state: PushFanoutState = {
      dailyEventId: input.dailyEventId,
      expiresAt: Date.now() + PUSH_FANOUT_LIFETIME_MS,
      tasks: shards.map((shard) => ({ shard, attempts: 0, availableAt: Date.now() })),
      alerted: false,
    };
    await this.ctx.storage.put('fanout', state);
    await this.ctx.storage.setAlarm(Date.now());
    return Response.json({ scheduled: true, shards: shards.length });
  }

  async alarm(): Promise<void> {
    const state = await this.ctx.storage.get<PushFanoutState>('fanout');
    if (!state) return;
    if (Date.now() >= state.expiresAt) {
      if (state.tasks.length > 0) {
        await Promise.allSettled([
          captureWorkerException(
            this.env.SENTRY_DSN,
            'push_fanout_expired',
            new Error('Push fanout expired with unfinished shards'),
            {
              dailyEventId: state.dailyEventId,
              unfinishedShards: state.tasks.map((task) => task.shard).join(','),
            },
          ),
          sendOperationalAlert(this.env, 'push-fanout-expired', {
            dailyEventId: state.dailyEventId,
            unfinishedShards: state.tasks.map((task) => task.shard),
            attemptsByShard: Object.fromEntries(
              state.tasks.map((task) => [task.shard, task.attempts]),
            ),
          }),
        ]);
      }
      await this.ctx.storage.delete('fanout');
      return;
    }

    const now = Date.now();
    const due = state.tasks
      .filter((task) => task.availableAt <= now)
      .slice(0, PUSH_FANOUT_CONCURRENCY);
    if (due.length === 0) {
      await this.ctx.storage.setAlarm(Math.min(...state.tasks.map((task) => task.availableAt)));
      return;
    }

    const dueShards = new Set(due.map((task) => task.shard));
    const remaining = state.tasks.filter((task) => !dueShards.has(task.shard));
    const results = await Promise.allSettled(
      due.map((task) => processPushFanout(this.env, {
        dailyEventId: state.dailyEventId,
        shard: task.shard,
      })),
    );

    let shouldAlert = false;
    results.forEach((result, index) => {
      const task = due[index];
      if (result.status === 'fulfilled') {
        if (result.value.continued) {
          remaining.push({ shard: task.shard, attempts: 0, availableAt: Date.now() });
        }
        return;
      }
      const attempts = task.attempts + 1;
      shouldAlert ||= attempts >= 8;
      const requestedDelay = (result.reason as { retryAfterSeconds?: unknown })
        ?.retryAfterSeconds;
      const delaySeconds = typeof requestedDelay === 'number'
        ? requestedDelay
        : Math.min(15, 2 ** Math.min(attempts, 4));
      remaining.push({
        shard: task.shard,
        attempts,
        availableAt: Date.now() + Math.max(1, delaySeconds) * 1_000,
      });
    });

    if (shouldAlert && !state.alerted) {
      state.alerted = true;
      await Promise.allSettled([
        captureWorkerException(
          this.env.SENTRY_DSN,
          'push_fanout_repeated_failure',
          new Error('One or more push shards repeatedly failed'),
          { dailyEventId: state.dailyEventId },
        ),
        sendOperationalAlert(this.env, 'push-fanout-repeated-failure', {
          dailyEventId: state.dailyEventId,
          failedShards: remaining.filter((task) => task.attempts >= 8).map((task) => task.shard),
        }),
      ]);
    }

    state.tasks = remaining;
    if (remaining.length === 0) {
      await this.ctx.storage.delete('fanout');
      return;
    }
    await this.ctx.storage.put('fanout', state);
    await this.ctx.storage.setAlarm(Math.min(...remaining.map((task) => task.availableAt)));
  }
}

/** Continues bounded retention batches until the database reports no backlog. */
export class DataMaintenanceAlarm extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
  }

  async fetch(request: Request): Promise<Response> {
    if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
    await this.ctx.storage.setAlarm(Date.now());
    return Response.json({ scheduled: true });
  }

  async alarm(): Promise<void> {
    try {
      const result = await runDataMaintenance(this.env);
      if (result.hasMore) await this.ctx.storage.setAlarm(Date.now() + 1_000);
    } catch (error) {
      console.error('Data maintenance alarm failed', error);
      await this.ctx.storage.setAlarm(Date.now() + 30_000);
    }
  }
}

function isAuthorized(request: Request, env: Env): boolean {
  const authorization = request.headers.get('authorization');
  return Boolean(env.ORCHESTRATOR_SECRET) && authorization === `Bearer ${env.ORCHESTRATOR_SECRET}`;
}

async function relayDomainEvents(env: Env): Promise<Response> {
  return fetchUpstream(`${env.SUPABASE_URL}/functions/v1/relay-domain-events`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-outbox-secret': env.OUTBOX_RELAY_SECRET,
    },
    body: '{}',
  });
}

async function relayResult(response: Response): Promise<{
  body: string;
  examined: number;
  hasMore: boolean;
  nextWakeAt: string | null;
}> {
  const body = await response.text();
  if (!response.ok) {
    throw new Error(`Outbox relay failed: ${response.status} ${body}`);
  }
  try {
    const parsed = JSON.parse(body) as {
      examined?: unknown;
      hasMore?: boolean;
      nextWakeAt?: unknown;
    };
    return {
      body,
      examined: typeof parsed.examined === 'number' ? parsed.examined : 0,
      hasMore: parsed.hasMore === true,
      nextWakeAt: typeof parsed.nextWakeAt === 'string' ? parsed.nextWakeAt : null,
    };
  } catch {
    return { body, examined: 0, hasMore: false, nextWakeAt: null };
  }
}

async function scheduleRelayWake(env: Env, nextWakeAt: string | null): Promise<void> {
  if (!nextWakeAt) return;
  const wakeTime = Date.parse(nextWakeAt);
  if (!Number.isFinite(wakeTime)) throw new Error('Relay returned an invalid nextWakeAt');
  const id = env.OUTBOX_RELAY_ALARM.idFromName('singleton');
  const response = await env.OUTBOX_RELAY_ALARM.get(id).fetch('https://alarm.internal/schedule', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ nextWakeAt: new Date(wakeTime).toISOString() }),
  });
  if (!response.ok) throw new Error(`Scheduling outbox relay wake failed: ${response.status}`);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const commandResponse = await handleCommandGateway(request, env);
    if (commandResponse) return commandResponse;
    if (!isAuthorized(request, env)) return new Response('Unauthorized', { status: 401 });
    const url = new URL(request.url);

    if (request.method === 'POST' && url.pathname === '/outbox/wake') {
      const id = env.OUTBOX_RELAY_ALARM.idFromName('singleton');
      const response = await env.OUTBOX_RELAY_ALARM.get(id).fetch('https://alarm.internal/wake', {
        method: 'POST',
      });
      return new Response(response.body, {
        status: response.status,
        headers: { 'content-type': 'application/json' },
      });
    }

    const match = /^\/events\/([0-9a-f-]+)\/alarm$/.exec(url.pathname);
    if ((request.method === 'PUT' || request.method === 'POST') && match) {
      const id = env.DOJI_EVENT_ALARM.idFromName(match[1]);
      return env.DOJI_EVENT_ALARM.get(id).fetch(request);
    }
    return new Response('Not found', { status: 404 });
  },

  async scheduled(_controller: ScheduledController, env: Env): Promise<void> {
    try {
      await checkOperationalHealth(
        env,
        () => wakeDomainRelayNow(env),
        (repairs) => repairEventAlarms(env, repairs),
      );
    } catch (error) {
      await Promise.allSettled([
        captureWorkerException(env.SENTRY_DSN, 'operational_health_check', error),
        sendOperationalAlert(env, 'operational-health-check-failed', {
          error: error instanceof Error ? error.message : String(error),
        }),
      ]);
      throw error;
    }
  },
} satisfies ExportedHandler<Env>;
