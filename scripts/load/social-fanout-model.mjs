// Offline demand arithmetic, NOT a capacity test or production traffic generator.
// Social Activity Center fanout does not imply an OS push to every friend.
const allowed = new Set(['users', 'average-friends', 'actions-per-user',
  'push-actions-per-user', 'installations-per-recipient', 'burst-seconds', 'batch-channels']);
for (const arg of process.argv.slice(2)) {
  if (!/^--[^=]+=.+$/.test(arg) || !allowed.has(arg.slice(2).split('=')[0])) {
    throw new Error(`Unsupported argument ${arg}; removed grouping/capacity assumptions must not silently pass`);
  }
}
const numberArg = (name, fallback, minimum = 0) => {
  const entries = process.argv.filter(value => value.startsWith(`--${name}=`));
  if (entries.length > 1) throw new Error(`Duplicate --${name}`);
  const value = entries.length ? Number(entries[0].split('=')[1]) : fallback;
  if (!Number.isFinite(value) || value < minimum) throw new Error(`Invalid --${name}`);
  return value;
};

const users = numberArg('users', 100_000, 1);
const averageFriends = numberArg('average-friends', 25);
const actionsPerUser = numberArg('actions-per-user', 2);
// Each eligible targeted event has one recipient, not averageFriends recipients.
// This is a scenario assumption, not an observed traffic measurement.
const pushActionsPerUser = numberArg('push-actions-per-user', 1);
const installationsPerRecipient = numberArg('installations-per-recipient', 1);
const burstSeconds = numberArg('burst-seconds', 60, 1);
const batchChannels = numberArg('batch-channels', 100, 1);
if (!Number.isSafeInteger(users) || !Number.isSafeInteger(batchChannels)) {
  throw new Error('users and batch-channels must be safe integers');
}
const socialSourceEvents = users * actionsPerUser;
const friendChannelPublications = socialSourceEvents * averageFriends;
const targetedPushEvents = users * pushActionsPerUser;
const targetedProviderRequests = targetedPushEvents * installationsPerRecipient;

const report = {
  kind: 'offline-demand-model',
  capacityVerified: false,
  productionTrafficSent: false,
  assumptions: { users, averageFriends, actionsPerUser, pushActionsPerUser,
    installationsPerRecipient, burstSeconds, batchChannels },
  socialSourceEvents,
  friendChannelPublications,
  // Uniform friend count approximation; actual degree distribution/batching differs.
  modeledFriendPublishRequests: socialSourceEvents * Math.ceil(averageFriends / batchChannels),
  targetedPushEvents,
  targetedProviderRequests,
  ratesPerSecond: {
    socialSourceEvents: Math.ceil(socialSourceEvents / burstSeconds),
    friendChannelPublications: Math.ceil(friendChannelPublications / burstSeconds),
    targetedPushEvents: Math.ceil(targetedPushEvents / burstSeconds),
    targetedProviderRequests: Math.ceil(targetedProviderRequests / burstSeconds),
  },
  exclusions: ['launch broadcast (separate model)', 'retries and reconnections',
    'shared-channel events', 'database reads/writes and query cost',
    'subscriber deliveries and provider billing units', 'measured provider/account limits'],
  conclusion: 'Demand only. No grouping delay or assumed headroom. Not a 100k readiness gate.',
};
if ([socialSourceEvents, friendChannelPublications, targetedPushEvents, targetedProviderRequests]
  .some(value => !Number.isFinite(value) || value > Number.MAX_SAFE_INTEGER)) {
  throw new Error('Scenario exceeds safe numeric range');
}
console.log(JSON.stringify(report));
