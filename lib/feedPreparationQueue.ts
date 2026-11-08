import type { Post } from '../types/database';
import {
  FEED_POST_PREPARATION_TIMEOUT_MS,
  feedPostPreparationKey,
  prepareFeedPostMedia,
} from './feedPostPreparation';

type Job = { post: Post; key: string; started: boolean; timer: ReturnType<typeof setTimeout> };
const CONCURRENCY = 2;

/** One mounted feed owns its queue, including native work from retired identities. */
export function createFeedPreparationQueue(onReady: (post: Post, prepared?: Post) => void) {
  const jobs = new Map<string, Job>();
  let active = 0;
  const remove = (job: Job) => {
    if (jobs.get(job.key) !== job) return false;
    clearTimeout(job.timer);
    jobs.delete(job.key);
    return true;
  };
  const finish = (job: Job, prepared?: Post) => {
    if (remove(job)) onReady(job.post, prepared);
  };
  const run = async (job: Job) => {
    try {
      const prepared = await prepareFeedPostMedia([job.post]);
      const ready = prepared.get(job.key);
      if (ready) finish(job, ready);
    } catch {
      // The arrival-time fallback still admits the social row, without a retry.
    } finally {
      active -= 1;
      pump();
    }
  };
  const pump = () => {
    for (const job of jobs.values()) {
      if (active >= CONCURRENCY) break;
      if (job.started) continue;
      job.started = true;
      active += 1;
      void run(job);
    }
  };
  return {
    enqueue(post: Post) {
      const key = feedPostPreparationKey(post);
      if (jobs.has(key)) return;
      const job: Job = {
        post,
        key,
        started: false,
        // Queue time counts too: two stuck native operations cannot hide later rows.
        timer: setTimeout(() => finish(job), FEED_POST_PREPARATION_TIMEOUT_MS),
      };
      jobs.set(key, job);
      pump();
    },
    retain(keys: Set<string>) {
      for (const job of jobs.values()) if (!keys.has(job.key)) remove(job);
    },
    reset() {
      for (const job of jobs.values()) remove(job);
      // Native preparation has no cancellation API. Keep its capacity occupied
      // until settlement; local fallback must not create unbounded native work.
    },
  };
}
