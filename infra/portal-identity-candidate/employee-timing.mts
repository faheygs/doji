// Request-local, content-free durations. Never record parameters, URLs, actors,
// cookies, SQL text, credentials, provider errors or request/response bodies.
import { AsyncLocalStorage } from 'node:async_hooks';
const stages = ['connect', 'query', 'close', 'identity'] as const;
type TimingStage = (typeof stages)[number];
export function createEmployeeTiming(clock = () => performance.now()) {
  const context = new AsyncLocalStorage<Record<TimingStage, number>>();
  return {
    async measure<T>(stage: TimingStage, task: () => Promise<T>): Promise<T> {
      if (!stages.includes(stage)) throw Error('Unknown timing stage');
      const current = context.getStore(),
        start = clock();
      try {
        return await task();
      } finally {
        if (current) current[stage] += Math.max(0, clock() - start);
      }
    },
    async request(task: () => Promise<Response>): Promise<Response> {
      const totals = { connect: 0, query: 0, close: 0, identity: 0 };
      const start = clock();
      return context.run(totals, async () => {
        const response = await task();
        const timing = { total: Math.max(0, clock() - start), ...totals };
        response.headers.set(
          'server-timing',
          Object.entries(timing)
            .map(([stage, ms]) => `${stage};dur=${Math.min(60000, Math.round(ms))}`)
            .join(', '),
        );
        return response;
      });
    },
  };
}
