-- Blocking is private account state. It must not create moderation work or notify
-- the administrator. Explicit reports continue to use trg_report_notify_admin.
drop trigger if exists trg_block_notify_admin on public.blocks;
drop function if exists public.trg_block_notify_admin();
