import { useChallengeStore } from '../../stores/useChallengeStore';
import { useCelebrationStore } from '../../stores/useCelebrationStore';
import { useProfileNavigationStore } from '../../stores/useProfileNavigationStore';
import type { UserEvent, Challenge } from '../../types/database';
import type { PreparedPostImage } from '../../utils/upload';

afterEach(() => {
  useChallengeStore.getState().clearCaptures();
  useCelebrationStore.getState().dismissBadgeUnlock();
  useProfileNavigationStore.getState().clear();
});

test('capture reset clears both cameras, video and challenge presentation together', () => {
  const event = { id: 'event-1' } as UserEvent;
  const challenge = { id: 'challenge-1' } as Challenge;
  const photo = { uri: 'file:///synthetic.jpg' } as PreparedPostImage;
  const state = useChallengeStore.getState();
  state.setCurrentUserEvent(event);
  state.setCurrentChallenge(challenge);
  state.setStatus('active');
  state.setCapturedPhoto(photo);
  state.setCapturedFrontPhoto(photo);
  state.setCapturedVideoUri('file:///synthetic.mp4');
  expect(useChallengeStore.getState()).toMatchObject({
    currentUserEvent: event,
    currentChallenge: challenge,
    status: 'active',
    capturedPhoto: photo,
    capturedFrontPhoto: photo,
    capturedVideoUri: 'file:///synthetic.mp4',
  });
  state.clearCaptures();
  expect(useChallengeStore.getState()).toMatchObject({
    currentUserEvent: null,
    currentChallenge: null,
    status: 'idle',
    capturedPhoto: null,
    capturedFrontPhoto: null,
    capturedVideoUri: null,
  });
  state.clearCaptures();
  expect(useChallengeStore.getState().status).toBe('idle');
});

test('a new badge replaces the pending celebration and dismissal clears it', () => {
  const payload = {
    categoryId: 'synthetic',
    name: 'Participation',
    tier: 'bronze',
    unlockedTiers: ['bronze'],
  } as const;
  const first = { ...payload, unlockedTiers: [...payload.unlockedTiers] };
  useCelebrationStore.getState().showBadgeUnlock(first);
  expect(useCelebrationStore.getState().badge).toEqual(first);
  const second = { ...first, categoryId: 'another' };
  useCelebrationStore.getState().showBadgeUnlock(second);
  expect(useCelebrationStore.getState().badge).toEqual(second);
  useCelebrationStore.getState().dismissBadgeUnlock();
  expect(useCelebrationStore.getState().badge).toBeNull();
});

test('profile navigation tracks only the latest destination and can be cleared', () => {
  useProfileNavigationStore.getState().begin('first');
  expect(useProfileNavigationStore.getState().pendingUsername).toBe('first');
  useProfileNavigationStore.getState().begin('second');
  expect(useProfileNavigationStore.getState().pendingUsername).toBe('second');
  useProfileNavigationStore.getState().clear();
  expect(useProfileNavigationStore.getState().pendingUsername).toBeNull();
});
