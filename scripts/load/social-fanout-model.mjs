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
const burstSeconds = numberArg('burst-seconds', 600);
const groupBucketSeconds = numberArg('group-bucket-seconds', 30);
const batchChannels = numberArg('batch-channels', 100);
const relayLanes = numberArg('relay-lanes', 128);
const relayWorkersPerLane = numberArg('relay-workers-per-lane', 8);
const assumedEventLatencyMs = numberArg('event-latency-ms', 250);
const nativeProviderRate = numberArg('native-provider-rate', 3500);

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
const requiredPushUpsertsPerSecond = durablePushUpserts / burstSeconds;
const requiredPushRowsPerSecond = durablePushRows / burstSeconds;
const totalRelayEventsPerSecond = sourceEventsPerSecond + requiredPushRowsPerSecond;
const relayConcurrency = relayLanes * relayWorkersPerLane;
const modeledRelayEventsPerSecond = relayConcurrency * (1000 / assumedEventLatencyMs);

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
  requiredPushUpsertsPerSecond: Math.ceil(requiredPushUpsertsPerSecond),
  requiredPushRowsPerSecond: Math.ceil(requiredPushRowsPerSecond),
  totalRelayEventsPerSecond: Math.ceil(totalRelayEventsPerSecond),
  modeledRelayEventsPerSecond: Math.floor(modeledRelayEventsPerSecond),
  nativeProviderRate,
  relayHeadroom: Number((modeledRelayEventsPerSecond / totalRelayEventsPerSecond).toFixed(2)),
  providerHeadroom: Number((nativeProviderRate / requiredPushRowsPerSecond).toFixed(2)),
};

console.log(JSON.stringify(report));
if (modeledRelayEventsPerSecond < totalRelayEventsPerSecond * 1.25) {
  throw new Error('Modeled relay headroom is below the 25% release floor');
}
if (nativeProviderRate < requiredPushRowsPerSecond * 1.25) {
  throw new Error('Modeled native-provider headroom is below the 25% release floor');
}
