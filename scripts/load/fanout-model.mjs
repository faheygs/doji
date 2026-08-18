import assert from 'node:assert/strict';

const users = Number(process.env.FANOUT_USERS ?? 100_000);
const shards = Number(process.env.FANOUT_SHARDS ?? 128);
const pageSize = Number(process.env.FANOUT_PAGE_SIZE ?? 500);
const concurrency = Number(process.env.FANOUT_CONCURRENCY ?? 16);
const pageLatencyMs = Number(process.env.FANOUT_PAGE_LATENCY_MS ?? 1_500);
const freshnessBudgetMs = Number(process.env.FANOUT_BUDGET_MS ?? 120_000);
const nativeProviderRatePerSecond = Number(process.env.NATIVE_PUSH_RATE_PER_SECOND ?? 2_500);
const expoRatePerSecond = 600;

const usersPerShard = Math.ceil(users / shards);
const pagesPerShard = Math.ceil(usersPerShard / pageSize);
const invocations = pagesPerShard * shards;
const rounds = Math.ceil(invocations / concurrency);
const orchestrationDurationMs = rounds * pageLatencyMs;
const nativeProviderDurationMs = Math.ceil(users / nativeProviderRatePerSecond) * 1_000;
const expoMinimumDurationMs = Math.ceil(users / expoRatePerSecond) * 1_000;
const modeledDurationMs = Math.max(orchestrationDurationMs, nativeProviderDurationMs);

assert.equal(shards, 128, 'database and queue partition counts must stay aligned');
assert.ok(pageSize <= 500, 'each Edge invocation must remain bounded');
assert.ok(
  expoMinimumDurationMs > freshnessBudgetMs,
  'the model must not accidentally treat Expo\'s 600/s gateway as the 100k scale path',
);
assert.ok(
  modeledDurationMs < freshnessBudgetMs,
  `modeled fanout ${modeledDurationMs}ms exceeds ${freshnessBudgetMs}ms freshness budget`,
);

console.log(JSON.stringify({
  users,
  shards,
  pageSize,
  concurrency,
  invocations,
  rounds,
  orchestrationDurationMs,
  nativeProviderRatePerSecond,
  nativeProviderDurationMs,
  expoMinimumDurationMs,
  modeledDurationMs,
  freshnessBudgetMs,
}));
