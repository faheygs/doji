import { DurableObject } from 'cloudflare:workers';
import type { Env } from './index';
import { captureWorkerException } from './sentry';
import {
  actionableOperationalIssue,
  checkOperationalHealth,
  sendOperationalAlert,
  type EventAlarmRepair,
} from './operational-health';

type HealthMonitorState = {
  issueFamily: string | null;
  consecutiveUnhealthy: number;
  consecutiveCheckFailures: number;
  alertedIssueFamily: string | null;
  checkFailureAlerted: boolean;
};

const HEALTH_SUSTAINED_CHECKS = 3;
const HEALTH_CHECK_FAILURE_THRESHOLD = 3;

async function wakeDomainRelay(env: Env): Promise<void> {
  const id = env.OUTBOX_RELAY_ALARM.idFromName('singleton');
  const response = await env.OUTBOX_RELAY_ALARM.get(id).fetch('https://alarm.internal/wake', {
    method: 'POST',
  });
  if (!response.ok) throw new Error(`Scheduling outbox relay failed: ${response.status}`);
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
    if (!response.ok) throw new Error(`Repairing event alarm failed: ${response.status}`);
  }));
  const failures = outcomes.filter((outcome) => outcome.status === 'rejected');
  if (failures.length > 0) throw new Error(`${failures.length} event alarm repair(s) failed`);
}

/** Pages only terminal failures or degradation sustained across three checks. */
export class HealthMonitor extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
  }

  async fetch(request: Request): Promise<Response> {
    if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
    const state = await this.ctx.storage.get<HealthMonitorState>('health') ?? {
      issueFamily: null,
      consecutiveUnhealthy: 0,
      consecutiveCheckFailures: 0,
      alertedIssueFamily: null,
      checkFailureAlerted: false,
    };
    try {
      const health = await checkOperationalHealth(
        this.env,
        () => wakeDomainRelay(this.env),
        (repairs) => repairEventAlarms(this.env, repairs),
      );
      const issue = actionableOperationalIssue(health);
      state.consecutiveCheckFailures = 0;
      state.checkFailureAlerted = false;
      if (!issue) {
        state.issueFamily = null;
        state.consecutiveUnhealthy = 0;
        state.alertedIssueFamily = null;
      } else {
        state.consecutiveUnhealthy = state.issueFamily === issue.family
          ? state.consecutiveUnhealthy + 1
          : 1;
        state.issueFamily = issue.family;
        const threshold = issue.immediate ? 1 : HEALTH_SUSTAINED_CHECKS;
        if (state.consecutiveUnhealthy >= threshold && state.alertedIssueFamily !== issue.family) {
          await Promise.allSettled([
            captureWorkerException(
              this.env.SENTRY_DSN,
              issue.family,
              new Error(`Operational health issue persisted: ${issue.family}`),
              { consecutiveChecks: state.consecutiveUnhealthy },
            ),
            sendOperationalAlert(this.env, issue.family, {
              ...health,
              consecutive_unhealthy_checks: state.consecutiveUnhealthy,
            }),
          ]);
          state.alertedIssueFamily = issue.family;
        }
      }
      await this.ctx.storage.put('health', state);
      return Response.json({ healthy: !issue, issue: issue?.family ?? null });
    } catch (error) {
      state.consecutiveCheckFailures += 1;
      if (
        state.consecutiveCheckFailures >= HEALTH_CHECK_FAILURE_THRESHOLD &&
        !state.checkFailureAlerted
      ) {
        await Promise.allSettled([
          captureWorkerException(this.env.SENTRY_DSN, 'operational_health_check', error, {
            consecutiveFailures: state.consecutiveCheckFailures,
          }),
          sendOperationalAlert(this.env, 'operational-health-check-failed', {
            consecutive_failures: state.consecutiveCheckFailures,
            error: error instanceof Error ? error.message : String(error),
          }),
        ]);
        state.checkFailureAlerted = true;
      }
      await this.ctx.storage.put('health', state);
      return Response.json(
        { healthy: false, monitorUnavailable: true, failures: state.consecutiveCheckFailures },
        { status: 503 },
      );
    }
  }
}
