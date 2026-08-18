// Retired: streaks and totals are maintained transactionally by Postgres.
// Keeping an Edge Function recomputation path allowed stale 90-row snapshots to
// overwrite authoritative lifetime totals.
export {};
