-- Disable frontend feature, restore prior gateway, and drain new callers FIRST.
-- Preserve lifecycle/review metadata, receipts, audits and all member data.
begin;
set local lock_timeout='2s';
drop function public.admin_editorial_command_v1(text,text,uuid,text,jsonb,text,text);
drop function public.get_admin_editorial_page_v1(text,integer,timestamptz,uuid,text);
drop function public.get_admin_editorial_item_v1(text,uuid);
drop function public.admin_editorial_item_v1(text,uuid);
drop function public.admin_editorial_authorize_v1(boolean);
-- Indexes and private state deliberately remain; no content/history reversal.
commit;
