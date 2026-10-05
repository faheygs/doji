import { DurableObject } from 'cloudflare:workers';
import type { Env } from './index';
import { captureWorkerException } from './sentry';
import { sendOperationalAlert } from './operational-health';

type RelayAlarmState = { nextWakeAt: string };
const OUTBOX_RECOVERY_ALARM_MS = 30_000;
const OUTBOX_MAX_PAGES_PER_ALARM = 8;
const UPSTREAM_TIMEOUT_MS = 5_000;
const RECOVERY_TIMEOUT_MS = 20_000;
// An aborted HTTP response does not prove the remote invocation stopped. Keep
// one durable lease-expiry recheck (existing DB leases are two minutes), even
// when the next claim finds nothing because that invocation still owns rows.
const UNCERTAIN_RECHECK_MS = 150_000;
async function relayDomainEvents(env: Env, signal: AbortSignal, drainId: string, page: number): Promise<Response> {
  return fetch(`${env.SUPABASE_URL}/functions/v1/relay-domain-events`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-outbox-secret': env.OUTBOX_RELAY_SECRET,
      'x-doji-relay-request-id': `${drainId}:${page}`,
    },
    body: '{}',
    signal,
  });
}
async function relayResult(response: Response): Promise<{
  hasMore: boolean;
  nextWakeAt: string | null;
  examined: number;
  published: number;
  failed: number;
}> {
  const body = await response.text();
  if (!response.ok) throw Object.assign(new Error('Relay HTTP failure'), { status: response.status });
  try {
    const parsed = JSON.parse(body) as {
      hasMore?: boolean;
      nextWakeAt?: unknown;
      examined?: unknown;
      published?: unknown;
      failed?: unknown;
    };
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)
      || (parsed.nextWakeAt != null && (typeof parsed.nextWakeAt !== 'string' || !Number.isFinite(Date.parse(parsed.nextWakeAt)))))
      throw new Error('Invalid relay response');
    return {
      hasMore: parsed.hasMore === true,
      nextWakeAt: typeof parsed.nextWakeAt === 'string' ? parsed.nextWakeAt : null,
      examined: typeof parsed.examined === 'number' ? parsed.examined : 0,
      published: typeof parsed.published === 'number' ? parsed.published : 0,
      failed: typeof parsed.failed === 'number' ? parsed.failed : 0,
    };
  } catch {
    throw new Error('Invalid relay response');
  }
}
export class OutboxRelayAlarm extends DurableObject<Env> {
  private drainTask: Promise<void> | null = null;
  private drainId: string | null = null;
  private drainStarting = false;
  private rerunRequested = false;

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
      // A wake can arrive after the active relay page has checked for more work
      // but before that drain has cleared its recovery alarm. Do not let the
      // finishing drain erase that wake: remember it in memory and make the
      // active task take another page before it is allowed to go idle.
      if (this.drainTask || this.drainStarting) {
        this.rerunRequested = true;
        return Response.json({
          scheduled: true,
          draining: true,
          drainId: this.drainId,
          rerunRequested: true,
        });
      }

      // The alarm is crash recovery; normal dispatch starts in this request.
      const acceptedAt = Date.now();
      const drainId = crypto.randomUUID();
      this.drainId = drainId;
      this.drainStarting = true;
      try {
        await this.schedule(new Date(Date.now() + OUTBOX_RECOVERY_ALARM_MS).toISOString());
        this.ctx.waitUntil(this.startDrain(drainId, acceptedAt));
        return Response.json({ scheduled: true, draining: true, drainId });
      } catch (error) {
        this.drainId = null;
        throw error;
      } finally {
        this.drainStarting = false;
      }
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
    let pageStartedAt = Date.now();
    let pageNumber = 0;
    let deadlineExpired = false;
    try {
      const uncertainAt = await this.ctx.storage.get<number>('uncertainRecheckAt');
      const budget = uncertainAt ? RECOVERY_TIMEOUT_MS : UPSTREAM_TIMEOUT_MS;
      let examined = 0;
      let published = 0;
      for (let page = 0; page < OUTBOX_MAX_PAGES_PER_ALARM; page += 1) {
        if (page === 0) {
          console.info('[outbox-relay] request started', JSON.stringify({
            drainId,
            wakeToRequestMs: Date.now() - acceptedAt,
          }));
        }
        pageStartedAt = Date.now();
        pageNumber = page + 1;
        const controller = new AbortController();
        let timer: ReturnType<typeof setTimeout> | undefined;
        const result = await Promise.race([
          relayDomainEvents(this.env, controller.signal, drainId, pageNumber).then(relayResult),
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => {
              deadlineExpired = true;
              controller.abort();
              reject(new Error('Relay deadline exceeded'));
            }, budget);
          }),
        ]).finally(() => clearTimeout(timer));
        examined += result.examined;
        published += result.published;
        console.info('[outbox-relay] page', JSON.stringify({
          drainId,
          page: page + 1,
          examined: result.examined,
          published: result.published,
          failed: result.failed,
          durationMs: Date.now() - pageStartedAt,
          hasMore: result.hasMore,
        }));
        if (result.hasMore) continue;

        if (this.rerunRequested) {
          this.rerunRequested = false;
          continue;
        }

        await Promise.all([
          this.ctx.storage.delete('failures'),
          this.ctx.storage.delete('wake'),
          this.ctx.storage.deleteAlarm(),
        ]);
        if (result.nextWakeAt) await this.schedule(result.nextWakeAt);
        if (uncertainAt && uncertainAt > Date.now()) {
          await this.schedule(new Date(uncertainAt).toISOString());
        } else if (uncertainAt) {
          await this.ctx.storage.delete('uncertainRecheckAt');
        }

        // Storage cleanup yields to other requests. If one arrived while the
        // old alarm was being removed, restore crash recovery and take another
        // page. The final check has no following await, so a wake cannot be
        // acknowledged and then lost before this task returns.
        if (this.rerunRequested) {
          this.rerunRequested = false;
          await this.schedule(new Date(Date.now() + OUTBOX_RECOVERY_ALARM_MS).toISOString());
          continue;
        }

        console.info('[outbox-relay] drain complete', JSON.stringify({
          drainId,
          examined,
          published,
          totalDurationMs: Date.now() - acceptedAt,
        }));
        return;
      }
      await this.ctx.storage.delete('wake');
      await this.ctx.storage.deleteAlarm();
      await this.schedule(new Date().toISOString());
    } catch (error) {
      const status = (error as { status?: number })?.status;
      const failureKind = deadlineExpired ? 'timeout' : status ? 'http' :
        error instanceof Error && error.message === 'Invalid relay response' ? 'invalid_response' : 'network';
      const safeError = new Error(`Relay ${failureKind}${status ? ` (${status})` : ''}`);
      console.warn('[outbox-relay] request failed', JSON.stringify({
        drainId, page: pageNumber, durationMs: Date.now() - pageStartedAt,
        failureKind, ...(status ? { status } : {}),
      }));
      await this.ctx.storage.put('uncertainRecheckAt', Date.now() + UNCERTAIN_RECHECK_MS);
      const failures = (await this.ctx.storage.get<number>('failures') ?? 0) + 1;
      await this.ctx.storage.put('failures', failures);
      if (failures === 10) {
        await Promise.allSettled([
          captureWorkerException(this.env.SENTRY_DSN, 'domain_relay_repeated_failure', safeError, {
            failures,
          }),
          sendOperationalAlert(this.env, 'domain-relay-repeated-failure', {
            failures,
            error: safeError.message,
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
