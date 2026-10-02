import { supabase } from './supabase';
import { runMemberRead } from './runMemberRead';
import { readThroughScaleGateway } from './scaleReadGateway';
import type { FeedAudience } from './feedAudience';

export function fetchPollSummary(dailyEventId: string, audience: FeedAudience, signal?: AbortSignal) {
  return readThroughScaleGateway(
    `/v1/polls/${encodeURIComponent(dailyEventId)}/summary?audience=${audience}`,
    async () => {
      const { data } = await runMemberRead(supabase.rpc('get_poll_results_summary', {
        p_daily_event_id: dailyEventId, p_audience: audience,
      }), signal);
      return data ?? [];
    },
    signal,
  );
}

export async function fetchPollVotersPage(
  dailyEventId: string,
  optionId: string,
  audience: FeedAudience,
  cursor: { createdAt: string; id: string } | null,
  signal?: AbortSignal,
) {
  const { data } = await runMemberRead(supabase.rpc('get_poll_option_voters_page', {
    p_daily_event_id: dailyEventId, p_option_id: optionId, p_audience: audience,
    p_limit: 40, p_before_created_at: cursor?.createdAt ?? null, p_before_id: cursor?.id ?? null,
  }), signal);
  return data ?? [];
}
