import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  readFeedAudiencePreference,
  writeFeedAudiencePreference,
} from '../../lib/feedAudiencePreference';

describe('feed audience preference', () => {
  beforeEach(async () => AsyncStorage.clear());

  it('defaults new accounts to everyone', async () => {
    await expect(readFeedAudiencePreference('user-1')).resolves.toBe('everyone');
  });

  it('remembers an explicit account-scoped choice', async () => {
    await writeFeedAudiencePreference('user-1', 'friends');
    await expect(readFeedAudiencePreference('user-1')).resolves.toBe('friends');
    await expect(readFeedAudiencePreference('user-2')).resolves.toBe('everyone');
  });
});
