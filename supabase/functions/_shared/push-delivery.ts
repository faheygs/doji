type RpcClient = {
  rpc: (
    name: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{
    data: unknown;
    error: { message: string } | null;
  }>;
};

export type PushDeliveryOutcome = 'accepted' | 'rejected' | 'invalid_token' | 'transport_error';

export type PushDeliveryResult = {
  deliveryKey: string;
  outcome: PushDeliveryOutcome;
  providerTicketId?: string;
  error?: string;
};

export async function claimPushDelivery(
  database: RpcClient,
  input: {
    deliveryKey: string;
    targetUserId: string;
    category: string;
    aggregateId?: string | null;
  },
): Promise<boolean> {
  const { data, error } = await database.rpc('claim_push_delivery', {
    p_delivery_key: input.deliveryKey,
    p_target_user_id: input.targetUserId,
    p_category: input.category,
    p_aggregate_id: input.aggregateId ?? null,
  });
  if (error) throw error;
  return data === true;
}

/** Outcome recording is telemetry only. A failed write must never unlock a resend. */
export async function recordPushDeliveryResults(
  database: RpcClient,
  results: PushDeliveryResult[],
): Promise<void> {
  if (results.length === 0) return;
  const { error } = await database.rpc('record_push_delivery_results', {
    p_results: results,
  });
  if (error) console.error('Could not record terminal push results:', error.message);
}
