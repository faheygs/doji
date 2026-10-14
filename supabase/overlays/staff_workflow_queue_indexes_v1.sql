-- OWNER-APPROVED LOCAL QUALIFICATION ONLY. Not an automatic migration.
-- The existing state/queue-first indexes do not serve the combined oldest-first
-- queue across ready/waiting or restricted/ordinary buckets. Keep all existing
-- indexes; these additive partial indexes match only the open inbox predicates.
-- Production needs explicit shared-system approval, relation-size/lock review
-- and a separately prepared concurrent-index procedure. Do not run this file
-- against production as-is: ordinary CREATE INDEX can block source writes.
begin;
set local lock_timeout='2s';
set local statement_timeout='8s';
create index staff_business_open_page_idx on business_private.applications(created_at,id)
 where state in ('pending','changes_requested');
create index staff_intake_open_page_idx on public.safety_removal_cases(received_at,id)
 where closed_at is null;
create index staff_privacy_open_page_idx on business_private.privacy_cases(received_at,id)
 where state not in ('completed','denied');
-- Retaining rollback intentionally keeps these indexes; never drop source data.
commit;
