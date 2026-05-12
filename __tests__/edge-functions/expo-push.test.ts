/**
 * Tests for the expo-push parseTickets and isInvalidTokenError logic.
 * Functions are replicated from _shared/expo-push.ts for Node testing.
 */

type ExpoTicketOk = { status: 'ok'; id?: string };
type ExpoTicketErr = {
  status: 'error';
  message?: string;
  details?: { error?: string; expoPushToken?: string };
};
type ExpoPushReceipt = ExpoTicketOk | ExpoTicketErr;

function parseTickets(json: unknown): ExpoPushReceipt[] {
  if (Array.isArray(json)) {
    return json as ExpoPushReceipt[];
  }
  if (json && typeof json === 'object' && 'data' in json && Array.isArray((json as { data: unknown }).data)) {
    return (json as { data: ExpoPushReceipt[] }).data;
  }
  return [];
}

const INVALID_TOKEN_ERRORS = new Set(['DeviceNotRegistered', 'InvalidCredentials']);

function isInvalidTokenError(ticket: ExpoPushReceipt): boolean {
  if (ticket.status !== 'error') return false;
  const code = ticket.details?.error ?? '';
  return INVALID_TOKEN_ERRORS.has(code);
}

describe('parseTickets', () => {
  it('handles raw array format', () => {
    const tickets = [{ status: 'ok', id: 'abc' }];
    expect(parseTickets(tickets)).toEqual(tickets);
  });

  it('handles { data: [...] } format', () => {
    const tickets = [{ status: 'ok', id: 'abc' }];
    expect(parseTickets({ data: tickets })).toEqual(tickets);
  });

  it('returns empty array for null', () => {
    expect(parseTickets(null)).toEqual([]);
  });

  it('returns empty array for undefined', () => {
    expect(parseTickets(undefined)).toEqual([]);
  });

  it('returns empty array for non-array non-object', () => {
    expect(parseTickets('string')).toEqual([]);
    expect(parseTickets(42)).toEqual([]);
  });

  it('returns empty array for object without data', () => {
    expect(parseTickets({ other: 'field' })).toEqual([]);
  });

  it('returns empty array for object with non-array data', () => {
    expect(parseTickets({ data: 'not-array' })).toEqual([]);
  });
});

describe('isInvalidTokenError', () => {
  it('returns false for ok ticket', () => {
    expect(isInvalidTokenError({ status: 'ok', id: 'abc' })).toBe(false);
  });

  it('returns true for DeviceNotRegistered', () => {
    expect(
      isInvalidTokenError({
        status: 'error',
        message: 'Token invalid',
        details: { error: 'DeviceNotRegistered' },
      }),
    ).toBe(true);
  });

  it('returns true for InvalidCredentials', () => {
    expect(
      isInvalidTokenError({
        status: 'error',
        details: { error: 'InvalidCredentials' },
      }),
    ).toBe(true);
  });

  it('returns false for other error types', () => {
    expect(
      isInvalidTokenError({
        status: 'error',
        details: { error: 'MessageTooBig' },
      }),
    ).toBe(false);
  });

  it('returns false when no details', () => {
    expect(isInvalidTokenError({ status: 'error', message: 'something' })).toBe(false);
  });

  it('returns false when details has no error key', () => {
    expect(
      isInvalidTokenError({
        status: 'error',
        details: { expoPushToken: 'ExponentPushToken[xxx]' },
      }),
    ).toBe(false);
  });
});

describe('invalidTokenIndices computation', () => {
  it('identifies indices of invalid token errors', () => {
    const tickets: ExpoPushReceipt[] = [
      { status: 'ok', id: '1' },
      { status: 'error', details: { error: 'DeviceNotRegistered' } },
      { status: 'ok', id: '3' },
      { status: 'error', details: { error: 'InvalidCredentials' } },
      { status: 'error', details: { error: 'MessageTooBig' } },
    ];

    const invalidIndices: number[] = [];
    tickets.forEach((t, i) => {
      if (isInvalidTokenError(t)) invalidIndices.push(i);
    });

    expect(invalidIndices).toEqual([1, 3]);
  });
});
