const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

export type ExpoMessage = {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: 'default';
  badge?: number;
  /** Seconds since epoch — supported by Expo push API for delayed delivery */
  ttl?: number;
};

type ExpoTicketOk = { status: 'ok'; id?: string };
type ExpoTicketErr = {
  status: 'error';
  message?: string;
  details?: { error?: string; expoPushToken?: string };
};

export type ExpoPushReceipt = ExpoTicketOk | ExpoTicketErr;

export type ExpoPushResult = {
  httpOk: boolean;
  tickets: ExpoPushReceipt[];
  /**
   * Indices into the original `messages` array for tokens that should be cleared
   * (e.g. DeviceNotRegistered, InvalidCredentials).
   */
  invalidTokenIndices: number[];
};

/**
 * Parse Expo push API JSON. Handles both `{ data: [...] }` and raw array shapes.
 */
function parseTickets(json: unknown): ExpoPushReceipt[] {
  if (Array.isArray(json)) {
    return json as ExpoPushReceipt[];
  }
  if (json && typeof json === 'object' && 'data' in json && Array.isArray((json as { data: unknown }).data)) {
    return (json as { data: ExpoPushReceipt[] }).data;
  }
  return [];
}

/** Expo ticket errors where the push token should be removed from the profile. */
const INVALID_TOKEN_ERRORS = new Set(['DeviceNotRegistered', 'InvalidCredentials']);

function isInvalidTokenError(ticket: ExpoPushReceipt): boolean {
  if (ticket.status !== 'error') return false;
  const code = ticket.details?.error ?? '';
  return INVALID_TOKEN_ERRORS.has(code);
}

export async function sendExpoPushMessages(messages: ExpoMessage[]): Promise<ExpoPushResult> {
  if (messages.length === 0) {
    return { httpOk: true, tickets: [], invalidTokenIndices: [] };
  }

  const res = await fetch(EXPO_PUSH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(messages),
  });

  let json: unknown;
  try {
    json = await res.json();
  } catch {
    json = null;
  }

  const tickets = parseTickets(json);
  const invalidTokenIndices: number[] = [];

  tickets.forEach((ticket, i) => {
    if (isInvalidTokenError(ticket)) invalidTokenIndices.push(i);
  });

  return {
    httpOk: res.ok,
    tickets,
    invalidTokenIndices,
  };
}

export { EXPO_PUSH_URL };
