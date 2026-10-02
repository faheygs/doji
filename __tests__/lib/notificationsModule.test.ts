test('notification module remains lazy and the Jest transform executes the real loader', async () => {
  const loaded = jest.fn();
  jest.doMock('expo-notifications', () => {
    loaded();
    return { nativeBoundary: 'synthetic' };
  });
  await jest.isolateModulesAsync(async () => {
    const { loadNotificationsModule } = await import('../../lib/notificationsModule');
    expect(loaded).not.toHaveBeenCalled();
    const result = await loadNotificationsModule();
    expect(result).toMatchObject({ nativeBoundary: 'synthetic' });
    expect(loaded).toHaveBeenCalledTimes(1);
  });
});
