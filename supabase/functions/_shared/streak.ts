import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

type UserEventRow = {
  status: string;
  expires_at: string;
  completed_at: string | null;
};

/**
 * Same streak semantics as recalculate-streak Edge Function — single source of truth.
 */
export async function recomputeUserStreakFromEvents(
  supabase: SupabaseClient,
  userId: string,
): Promise<{
  current_streak: number;
  longest_streak: number;
  total_completions: number;
  total_missed: number;
}> {
  const { data: events, error: fetchError } = await supabase
    .from('user_events')
    .select('status, expires_at, completed_at')
    .eq('user_id', userId)
    .in('status', ['completed', 'missed', 'late'])
    .order('expires_at', { ascending: false })
    .limit(90);

  if (fetchError) throw fetchError;

  const rows = (events ?? []) as UserEventRow[];

  let currentStreak = 0;
  let longestStreak = 0;
  let runningStreak = 0;
  let countingCurrent = true;

  for (const event of rows) {
    const isComplete = event.status === 'completed' || event.status === 'late';

    if (isComplete) {
      runningStreak++;
      longestStreak = Math.max(longestStreak, runningStreak);
    } else {
      if (countingCurrent) {
        currentStreak = runningStreak;
        countingCurrent = false;
      }
      runningStreak = 0;
    }
  }

  if (countingCurrent) currentStreak = runningStreak;

  const { data: existingProfile } = await supabase
    .from('profiles')
    .select('longest_streak')
    .eq('id', userId)
    .single();

  const newLongest = Math.max(longestStreak, existingProfile?.longest_streak ?? 0);
  const totalCompletions = rows.filter((e) => e.status === 'completed' || e.status === 'late').length;
  const totalMissed = rows.filter((e) => e.status === 'missed').length;

  const { error: updateError } = await supabase
    .from('profiles')
    .update({
      current_streak: currentStreak,
      longest_streak: newLongest,
      total_completions: totalCompletions,
      total_missed: totalMissed,
    })
    .eq('id', userId);

  if (updateError) throw updateError;

  return {
    current_streak: currentStreak,
    longest_streak: newLongest,
    total_completions: totalCompletions,
    total_missed: totalMissed,
  };
}
