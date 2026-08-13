import { DurableObject } from 'cloudflare:workers';

interface Env {
  DOJI_EVENT_ALARM: DurableObjectNamespace<DojiEventAlarm>;
  OUTBOX_RELAY_ALARM: DurableObjectNamespace<OutboxRelayAlarm>;
  DOMAIN_EVENT_QUEUE: Queue<OutboxWake>;
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

type OutboxWake = { requestedAt: string };

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
    if (request.method !== 'PUT') return new Response('Method not allowed', { status: 405 });
    const input = await request.json<RelayAlarmState>();
    await this.schedule(input.nextWakeAt);
    return Response.json({ scheduled: true, nextWakeAt: input.nextWakeAt });
  }

  async alarm(): Promise<void> {
    await this.ctx.storage.delete('wake');
    const result = await relayResult(await relayDomainEvents(this.env));
    if (result.hasMore) {
      await this.env.DOMAIN_EVENT_QUEUE.send({ requestedAt: new Date().toISOString() });
    } else if (result.nextWakeAt) {
      await this.schedule(result.nextWakeAt);
    }
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
  hasMore: boolean;
  nextWakeAt: string | null;
}> {
  const body = await response.text();
  if (!response.ok) {
    throw new Error(`Outbox relay failed: ${response.status} ${body}`);
  }
  try {
    const parsed = JSON.parse(body) as { hasMore?: boolean; nextWakeAt?: unknown };
    return {
      body,
      hasMore: parsed.hasMore === true,
      nextWakeAt: typeof parsed.nextWakeAt === 'string' ? parsed.nextWakeAt : null,
    };
  } catch {
    return { body, hasMore: false, nextWakeAt: null };
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
      let directRelayFailure: { status?: number; error: string } | null = null;
      try {
        const response = await relayDomainEvents(env);
        if (response.ok) {
          const result = await relayResult(response);
          if (result.hasMore) {
            await env.DOMAIN_EVENT_QUEUE.send({ requestedAt: new Date().toISOString() });
          } else {
            await scheduleRelayWake(env, result.nextWakeAt);
          }
          return new Response(result.body, {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        directRelayFailure = {
          status: response.status,
          error: await response.text(),
        };
      } catch (error) {
        directRelayFailure = {
          error: error instanceof Error ? error.message : String(error),
        };
        // The durable queue below owns retry when the direct relay is unavailable.
      }

      console.error('Direct outbox relay failed; queued for retry', directRelayFailure);
      await env.DOMAIN_EVENT_QUEUE.send({ requestedAt: new Date().toISOString() });
      return Response.json({ queued: true, directRelayFailure }, { status: 202 });
    }

    const match = /^\/events\/([0-9a-f-]+)\/alarm$/.exec(url.pathname);
    if ((request.method === 'PUT' || request.method === 'POST') && match) {
      const id = env.DOJI_EVENT_ALARM.idFromName(match[1]);
      return env.DOJI_EVENT_ALARM.get(id).fetch(request);
    }
    return new Response('Not found', { status: 404 });
  },

  async queue(batch: MessageBatch<OutboxWake>, env: Env): Promise<void> {
    try {
      const result = await relayResult(await relayDomainEvents(env));
      if (result.hasMore) {
        await env.DOMAIN_EVENT_QUEUE.send({ requestedAt: new Date().toISOString() });
      } else {
        await scheduleRelayWake(env, result.nextWakeAt);
      }
      batch.ackAll();
    } catch (error) {
      batch.retryAll({ delaySeconds: 2 });
      throw error;
    }
  },
} satisfies ExportedHandler<Env, OutboxWake>;
