import { DurableObject } from 'cloudflare:workers';

interface Env {
  DOJI_EVENT_ALARM: DurableObjectNamespace<DojiEventAlarm>;
  OUTBOX_RELAY_ALARM: DurableObjectNamespace<OutboxRelayAlarm>;
  DOMAIN_EVENT_QUEUE: Queue<OutboxWake>;
  PUSH_FANOUT_QUEUE: Queue<PushFanoutMessage>;
  SUPABASE_URL: string;
  ORCHESTRATOR_SECRET: string;
  OUTBOX_RELAY_SECRET: string;
}

type AlarmState = {
  dailyEventId: string;
  phase: 'prelive' | 'activate' | 'close';
  firesAt: string;
  closesAt?: string;
  chainNext: boolean;
  closeAction?: 'close' | 'close_targeted';
};

type OutboxWake = { requestedAt: string; generation?: number };
type PushFanoutMessage = { dailyEventId: string; shard: number };

const PUSH_SHARD_COUNT = 128;
const QUEUE_SEND_BATCH_SIZE = 100;
const OUTBOX_INITIAL_DRAIN_LANES = 16;
const OUTBOX_MAX_SCALE_GENERATION = 3;
const OUTBOX_WAKE_COALESCE_MS = 250;

function isPushFanoutMessage(
  value: OutboxWake | PushFanoutMessage | undefined,
): value is PushFanoutMessage {
  return Boolean(
    value &&
      'dailyEventId' in value &&
      typeof value.dailyEventId === 'string' &&
      'shard' in value &&
      Number.isInteger(value.shard),
  );
}

async function enqueueDojiPushFanout(env: Env, dailyEventId: string): Promise<void> {
  const messages = Array.from({ length: PUSH_SHARD_COUNT }, (_, shard) => ({
    body: { dailyEventId, shard },
  }));
  for (let index = 0; index < messages.length; index += QUEUE_SEND_BATCH_SIZE) {
    await env.PUSH_FANOUT_QUEUE.sendBatch(
      messages.slice(index, index + QUEUE_SEND_BATCH_SIZE),
    );
  }
}

async function processPushFanout(
  env: Env,
  message: PushFanoutMessage,
): Promise<{ continued: boolean; retryAfterSeconds?: number }> {
  const response = await fetch(`${env.SUPABASE_URL}/functions/v1/fanout-doji-push`, {
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
  const response = await fetch(`${env.SUPABASE_URL}/functions/v1/orchestrate-doji`, {
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
  const response = await fetch(`${env.SUPABASE_URL}/functions/v1/schedule-daily-challenge`, {
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

async function runDataMaintenance(env: Env): Promise<void> {
  const response = await fetch(`${env.SUPABASE_URL}/functions/v1/run-data-maintenance`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-outbox-secret': env.OUTBOX_RELAY_SECRET,
    },
    body: '{}',
  });
  if (!response.ok) {
    throw new Error(`Data maintenance failed: ${response.status} ${await response.text()}`);
  }
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
    const alarmAt = phase === 'close'
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
      // Queue partition seeding is idempotent at the database delivery-key and
      // shard-lease boundaries. If this alarm retries after a partial enqueue,
      // duplicate messages cannot produce duplicate user notifications.
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

    await orchestrateDoji<number>(
      this.env,
      state.closeAction ?? 'close',
      state.dailyEventId,
    );
    if (state.chainNext !== false) {
      // Chain the next one-shot alarm from the production event only. Targeted
      // test events close independently and never alter the production chain.
      await prepareNextDoji(this.env);
    }
    this.ctx.waitUntil(
      runDataMaintenance(this.env).catch((error) => {
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

  private async seedDrain(): Promise<void> {
    await this.env.DOMAIN_EVENT_QUEUE.sendBatch(
      Array.from({ length: OUTBOX_INITIAL_DRAIN_LANES }, () => ({
        body: { requestedAt: new Date().toISOString(), generation: 0 },
      })),
    );
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
    await this.seedDrain();
  }
}

function isAuthorized(request: Request, env: Env): boolean {
  const authorization = request.headers.get('authorization');
  return Boolean(env.ORCHESTRATOR_SECRET) && authorization === `Bearer ${env.ORCHESTRATOR_SECRET}`;
}

async function relayDomainEvents(env: Env): Promise<Response> {
  return fetch(`${env.SUPABASE_URL}/functions/v1/relay-domain-events`, {
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
    if (!isAuthorized(request, env)) return new Response('Unauthorized', { status: 401 });
    const url = new URL(request.url);

    if (request.method === 'POST' && url.pathname === '/outbox/wake') {
      const id = env.OUTBOX_RELAY_ALARM.idFromName('singleton');
      const response = await env.OUTBOX_RELAY_ALARM.get(id).fetch(
        'https://alarm.internal/wake',
        { method: 'POST' },
      );
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

  async queue(
    batch: MessageBatch<OutboxWake | PushFanoutMessage>,
    env: Env,
  ): Promise<void> {
    if (isPushFanoutMessage(batch.messages[0]?.body)) {
      await Promise.all(
        batch.messages.map(async (queued) => {
          const message = queued.body as PushFanoutMessage;
          try {
            const result = await processPushFanout(env, message);
            if (result.continued) await env.PUSH_FANOUT_QUEUE.send(message);
            queued.ack();
          } catch (error) {
            const retryAfterSeconds =
              typeof (error as { retryAfterSeconds?: unknown }).retryAfterSeconds === 'number'
                ? (error as { retryAfterSeconds: number }).retryAfterSeconds
                : 2;
            queued.retry({ delaySeconds: Math.max(1, retryAfterSeconds) });
          }
        }),
      );
      return;
    }

    try {
      const result = await relayResult(await relayDomainEvents(env));
      if (result.hasMore) {
        const wake = batch.messages[0]?.body as OutboxWake | undefined;
        const generation = Math.max(0, wake?.generation ?? 0);
        const nextGeneration = Math.min(generation + 1, OUTBOX_MAX_SCALE_GENERATION);
        const continuationCount = result.examined >= 100 && generation < OUTBOX_MAX_SCALE_GENERATION
          ? 2
          : 1;
        await env.DOMAIN_EVENT_QUEUE.sendBatch(
          Array.from({ length: continuationCount }, () => ({
            body: { requestedAt: new Date().toISOString(), generation: nextGeneration },
          })),
        );
      } else {
        await scheduleRelayWake(env, result.nextWakeAt);
      }
      batch.ackAll();
    } catch (error) {
      batch.retryAll({ delaySeconds: 2 });
      throw error;
    }
  },
} satisfies ExportedHandler<Env, OutboxWake | PushFanoutMessage>;
