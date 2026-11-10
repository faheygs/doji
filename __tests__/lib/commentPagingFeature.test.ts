import { commentPagingEnabled } from '../../lib/commentPagingFeature';

const stagingDev = {
  development: true,
  environment: 'staging',
  channel: 'development',
  url: 'https://ohrcupagdoilkwhecict.supabase.co',
};
test('only the exact staging-bound Dev client can qualify comment paging', () => {
  expect(commentPagingEnabled(stagingDev)).toBe(true);
});
test.each([
  { development: false },
  { environment: 'production' },
  { environment: undefined },
  { channel: 'staging' },
  { channel: 'production' },
  { channel: undefined },
  { url: 'https://tvixsmqxotuvyjqzmjla.supabase.co' },
  { url: undefined },
  { url: 'https://ohrcupagdoilkwhecict.supabase.co.attacker.invalid' },
])('mixed, absent or installed-release bindings remain disabled: %j', (override) => {
  expect(commentPagingEnabled({ ...stagingDev, ...override })).toBe(false);
});
