import { DurableObject } from 'cloudflare:workers';
import type { Env } from './index';
import { captureWorkerException } from './sentry';
import { sendOperationalAlert } from './operational-health';

type RelayAlarmState = { nextWakeAt: string };

const OUTBOX_RECOVERY_ALARM_MS = 30_000;
const OUTBOX_MAX_PAGES_PER_ALARM = 8;
const UPSTREAM_TIMEOUT_MS = 12_000;

function fetchUpstream(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  return fetch(input, {
    ...init,
    signal: init.signal ?? AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
  });
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
  hasMore: boolean;
  nextWakeAt: string | null;
}> {
  const body = await response.text();
  if (!response.ok) throw new Error(`Outbox relay failed: ${response.status} ${body}`);
  try {
    const parsed = JSON.parse(body) as { hasMore?: boolean; nextWakeAt?: unknown };
    return {
      hasMore: parsed.hasMore === true,
      nextWakeAt: typeof parsed.nextWakeAt === 'string' ? parsed.nextWakeAt : null,
    };
  } catch {
    return { hasMore: false, nextWakeAt: null };
  }
}

export class OutboxRelayAlarm extends DurableObject<Env> {
  private drainTask: Promise<void> | null = null;
  private drainId: string | null = null;

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
      // The alarm is crash recovery; normal dispatch starts in this request.
      await this.schedule(new Date(Date.now() + OUTBOX_RECOVERY_ALARM_MS).toISOString());
      const acceptedAt = Date.now();
      const drainId = this.drainId ?? crypto.randomUUID();
      this.ctx.waitUntil(this.startDrain(drainId, acceptedAt));
      return Response.json({ scheduled: true, draining: true, drainId });
    }
    if (request.method !== 'PUT') return new Response('Method not allowed', { status: 405 });
    const input = await request.json<RelayAlarmState>();
    await this.schedule(input.nextWakeAt);
    return Response.json({ scheduled: true, nextWakeAt: input.nextWakeAt });
  }

  private startDrain(drainId: string = crypto.randomUUID(), acceptedAt = Date.now()): Promise<void> {
    if (this.drainTask) return this.drainTask;
    this.drainId = drainId;
    const task = this.runDrain(drainId, acceptedAt).finally(() => {
      if (this.drainTask === task) {
        this.drainTask = null;
        this.drainId = null;
      }
    });
    this.drainTask = task;
    return task;
  }

  private async runDrain(drainId: string, acceptedAt: number): Promise<void> {
    try {
      for (let page = 0; page < OUTBOX_MAX_PAGES_PER_ALARM; page += 1) {
        if (page === 0) {
          console.info('[outbox-relay] first claim', JSON.stringify({
            drainId,
            wakeToClaimMs: Date.now() - acceptedAt,
          }));
        }
        const result = await relayResult(await relayDomainEvents(this.env));
        if (result.hasMore) continue;
        await this.ctx.storage.delete('failures');
        await this.ctx.storage.delete('wake');
        await this.ctx.storage.deleteAlarm();
        if (result.nextWakeAt) await this.schedule(result.nextWakeAt);
        return;
      }
      await this.ctx.storage.delete('wake');
      await this.ctx.storage.deleteAlarm();
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

  async alarm(): Promise<void> {
    // The stored wake belongs to the alarm being consumed. Remove it so a
    // failed drain can install an earlier retry instead of being suppressed by
    // the stale timestamp.
    await this.ctx.storage.delete('wake');
    await this.startDrain();
  }
}
