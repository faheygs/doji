const numberArg = (name, fallback) => {
  const entry = process.argv.find((value) => value.startsWith(`--${name}=`));
  const value = entry ? Number(entry.split('=')[1]) : fallback;
  if (!Number.isFinite(value) || value <= 0) throw new Error(`Invalid --${name}`);
  return value;
};

const users = numberArg('users', 100_000);
const averageFriends = numberArg('average-friends', 25);
const actionsPerUser = numberArg('actions-per-user', 2);
const pushActionsPerUser = numberArg('push-actions-per-user', 1);
const burstSeconds = numberArg('burst-seconds', 60);
const groupBucketSeconds = numberArg('group-bucket-seconds', 30);
const batchChannels = numberArg('batch-channels', 100);
const relayConcurrency = numberArg('relay-concurrency', 128);
const relayBatchSize = numberArg('relay-batch-size', 100);
const assumedBatchLatencyMs = numberArg('batch-latency-ms', 500);
const nativeProviderRate = numberArg('native-provider-rate', 5000);
// These are target capacity contracts, not claims about today's free plans.
// They become provider/compute settings when scale mode is enabled.
const ablyMessageRate = numberArg('ably-message-rate', 250000);
const databaseUpsertRate = numberArg('database-upsert-rate', 250000);

const sourceEvents = users * actionsPerUser;
const friendDeliveries = sourceEvents * averageFriends;
const ablyRequests = sourceEvents * Math.ceil(averageFriends / batchChannels);
const durablePushUpserts = users * pushActionsPerUser * averageFriends;
const bucketCount = Math.max(1, Math.ceil(burstSeconds / groupBucketSeconds));
const friendPushActions = averageFriends * pushActionsPerUser;
const occupiedBucketProbability = 1 - Math.pow(1 - (1 / bucketCount), friendPushActions);
const durablePushRows = Math.ceil(users * bucketCount * occupiedBucketProbability);
const sourceEventsPerSecond = sourceEvents / burstSeconds;
const requiredAblyRequestsPerSecond = ablyRequests / burstSeconds;
const requiredAblyMessagesPerSecond = friendDeliveries / burstSeconds;
const requiredPushUpsertsPerSecond = durablePushUpserts / burstSeconds;
const requiredPushRowsPerSecond = durablePushRows / burstSeconds;
const totalRelayEventsPerSecond = sourceEventsPerSecond + requiredPushRowsPerSecond;
const modeledRelayEventsPerSecond =
  relayConcurrency * relayBatchSize * (1000 / assumedBatchLatencyMs);

const report = {
  users,
  averageFriends,
  burstSeconds,
  groupBucketSeconds,
  sourceEvents,
  friendDeliveries,
  ablyRequests,
  durablePushUpserts,
  durablePushRows,
  sourceEventsPerSecond: Math.ceil(sourceEventsPerSecond),
  requiredAblyRequestsPerSecond: Math.ceil(requiredAblyRequestsPerSecond),
  requiredAblyMessagesPerSecond: Math.ceil(requiredAblyMessagesPerSecond),
  requiredPushUpsertsPerSecond: Math.ceil(requiredPushUpsertsPerSecond),
  requiredPushRowsPerSecond: Math.ceil(requiredPushRowsPerSecond),
  totalRelayEventsPerSecond: Math.ceil(totalRelayEventsPerSecond),
  modeledRelayEventsPerSecond: Math.floor(modeledRelayEventsPerSecond),
  nativeProviderRate,
  ablyMessageRate,
  databaseUpsertRate,
  relayHeadroom: Number((modeledRelayEventsPerSecond / totalRelayEventsPerSecond).toFixed(2)),
  providerHeadroom: Number((nativeProviderRate / requiredPushRowsPerSecond).toFixed(2)),
  ablyMessageHeadroom: Number((ablyMessageRate / requiredAblyMessagesPerSecond).toFixed(2)),
  databaseUpsertHeadroom: Number((databaseUpsertRate / requiredPushUpsertsPerSecond).toFixed(2)),
};

console.log(JSON.stringify(report));
if (modeledRelayEventsPerSecond < totalRelayEventsPerSecond * 1.25) {
  throw new Error('Modeled relay headroom is below the 25% release floor');
}
if (nativeProviderRate < requiredPushRowsPerSecond * 1.25) {
  throw new Error('Modeled native-provider headroom is below the 25% release floor');
}
if (ablyMessageRate < requiredAblyMessagesPerSecond * 1.25) {
  throw new Error('Modeled Ably message headroom is below the 25% release floor');
}
if (databaseUpsertRate < requiredPushUpsertsPerSecond * 1.25) {
  throw new Error('Modeled database upsert headroom is below the 25% release floor');
}
