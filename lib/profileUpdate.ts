import type { Profile } from '../types/database';
import { executeCommand } from './commandGateway';
import { filterContent } from './contentFilter';
import { newCommandId } from './idempotency';

export type ProfileSaveState = 'idle' | 'saving' | 'uncertain';
type Intent = { userId: string; epoch: number; patch: Partial<Profile>; key: string };
type Dependencies = {
  userId: () => string | undefined;
  state: (state: ProfileSaveState) => void;
  confirmed: (profile: Profile, replayed: boolean) => void;
};
const changedAccount = () => new Error('The account changed before this profile save finished.');

function frozenCopy<T>(value: T): T {
  const copy = JSON.parse(JSON.stringify(value)) as T;
  const freeze = (item: unknown) => {
    if (!item || typeof item !== 'object') return;
    Object.values(item).forEach(freeze);
    Object.freeze(item);
  };
  freeze(copy);
  return copy;
}

/** One immutable command per account lifetime. A lost reply is not a rollback. */
export function createProfileUpdater(deps: Dependencies) {
  let epoch = 0;
  let pending: Intent | null = null;
  let active: Promise<void> | null = null;
  const current = (intent: Intent) => intent.epoch === epoch && deps.userId() === intent.userId;

  const send = (intent: Intent, replayed = false): Promise<void> => {
    deps.state('saving');
    const work = Promise.resolve().then(async () => {
      try {
        if (!current(intent)) throw changedAccount();
        const { data, error } = await executeCommand('update_own_profile', {
          p_patch: intent.patch,
          p_idempotency_key: intent.key,
        }, { expectedUserId: intent.userId, isCurrent: () => current(intent) });
        if (!current(intent)) throw changedAccount();
        if (error) {
          // These SQL failures abort the atomic transaction; transport errors do not.
          if (['P0001', '23505', '23514', '22023', '42501'].includes(error.code)) pending = null;
          throw error;
        }
        if (!data) throw new Error('Profile update returned no row');
        if ((data as Profile).id !== intent.userId) throw new Error('Profile update returned another account');
        deps.confirmed(data as Profile, replayed);
        if (pending === intent) pending = null;
      } finally {
        if (current(intent)) {
          active = null;
          deps.state(pending ? 'uncertain' : 'idle');
        }
      }
    });
    active = work;
    return work;
  };

  return {
    capture: () => {
      const owner = { userId: deps.userId(), epoch };
      return { userId: owner.userId, isCurrent: () => owner.epoch === epoch && owner.userId === deps.userId() };
    },
    update: (updates: Partial<Profile>): Promise<void> => {
      const userId = deps.userId();
      if (!userId) return Promise.reject(new Error('Not authenticated'));
      if (pending) return Promise.reject(new Error('Retry the previous profile save before making another change.'));
      for (const field of ['username', 'display_name', 'bio'] as const) {
        const value = updates[field];
        if (typeof value !== 'string') continue;
        const result = filterContent(value);
        if (!result.ok) return Promise.reject(new Error(result.reason));
      }
      pending = { userId, epoch, patch: frozenCopy(updates), key: newCommandId('profile-update') };
      return send(pending);
    },
    retry: (): Promise<void> => {
      if (active) return active;
      if (!pending) return Promise.reject(new Error('There is no profile save to retry.'));
      return send(pending, true);
    },
    reset: () => {
      epoch += 1;
      pending = null;
      active = null;
      deps.state('idle');
    },
  };
}
