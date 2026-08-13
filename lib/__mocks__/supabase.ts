const mockChain = () => {
  const chain: Record<string, jest.Mock> = {};
  const methods = [
    'select', 'insert', 'update', 'delete', 'upsert',
    'eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in', 'is',
    'not', 'or', 'and', 'filter', 'match',
    'order', 'limit', 'range', 'single', 'maybeSingle',
    'returns', 'throwOnError', 'csv', 'explain',
    'textSearch', 'ilike', 'like', 'abortSignal',
  ];
  methods.forEach((m) => {
    chain[m] = jest.fn().mockReturnValue(chain);
  });
  // Terminal methods return a resolved promise by default
  chain.single = jest.fn().mockResolvedValue({ data: null, error: null });
  chain.maybeSingle = jest.fn().mockResolvedValue({ data: null, error: null });
  delete chain.then; // make it non-thenable so jest doesn't auto-await
  return chain;
};

const chain = mockChain();

export const supabase = {
  from: jest.fn().mockReturnValue(chain),
  auth: {
    getSession: jest.fn().mockResolvedValue({ data: { session: null }, error: null }),
    signInWithPassword: jest.fn().mockResolvedValue({ data: {}, error: null }),
    signUp: jest.fn().mockResolvedValue({ data: {}, error: null }),
    signOut: jest.fn().mockResolvedValue({ error: null }),
    onAuthStateChange: jest.fn().mockReturnValue({ data: { subscription: { unsubscribe: jest.fn() } } }),
    updateUser: jest.fn().mockResolvedValue({ data: {}, error: null }),
  },
  storage: {
    from: jest.fn().mockReturnValue({
      upload: jest.fn().mockResolvedValue({ data: {}, error: null }),
      getPublicUrl: jest.fn().mockReturnValue({ data: { publicUrl: 'https://mock.url/file' } }),
      remove: jest.fn().mockResolvedValue({ data: {}, error: null }),
    }),
  },
  channel: jest.fn().mockReturnValue({
    on: jest.fn().mockReturnThis(),
    subscribe: jest.fn().mockReturnThis(),
    unsubscribe: jest.fn(),
  }),
  removeChannel: jest.fn(),
  rpc: jest.fn().mockResolvedValue({ data: null, error: null }),
};
