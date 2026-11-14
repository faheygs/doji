import { supabase } from '../../lib/supabase';
import { readCommentPage, retainedCommentRows } from '../../lib/commentPageReads';
import { row, page, scope } from '../fixtures/commentWindow';

jest.mock('../../lib/supabase', () => ({ supabase: { rpc: jest.fn() } }));
const rpc = supabase.rpc as jest.Mock;
beforeEach(() => rpc.mockReset());
test.each(['page', 'refresh'])('%s preserves exact counts and supports the previous server during rollback', async mode => {
  for (const reply_count of [undefined, 0, 1, 123, 100000]) {
    const value = { ...row('root'), has_replies: !!reply_count, reply_count };
    rpc.mockReturnValueOnce({ abortSignal: async () => ({
      data: mode === 'page' ? { ...page([]), items: [value] } : [value], error: null,
    }) });
    const signal = new AbortController().signal;
    const result = mode === 'page'
      ? (await readCommentPage(scope, { direction: 'next', cursor: null }, signal)).items
      : await retainedCommentRows(scope, ['root'], signal);
    expect(result[0].reply_count).toBe(reply_count);
  }
});
test.each(['page', 'refresh'])('%s rejects malformed or contradictory reply totals', async mode => {
  for (const reply_count of [-1, 1.5, '123', null, Number.MAX_SAFE_INTEGER + 1, 0]) {
    const value = { ...row('root'), has_replies: true, reply_count };
    rpc.mockReturnValueOnce({ abortSignal: async () => ({
      data: mode === 'page' ? { ...page([]), items: [value] } : [value], error: null,
    }) });
    const signal = new AbortController().signal;
    await expect(mode === 'page'
      ? readCommentPage(scope, { direction: 'next', cursor: null }, signal)
      : retainedCommentRows(scope, ['root'], signal)).rejects.toThrow(/Invalid comment/);
  }
});
