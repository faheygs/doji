-- Retains every member/comment/receipt. Roll the client back before removing its read API.
begin;
set local lock_timeout = '2s';
drop function if exists public.get_comment_rows_v2(uuid,uuid[],text);
drop function if exists public.get_comment_page_v2(uuid,text,uuid,timestamptz,uuid,text,integer);
drop function if exists comment_read_private.project_row(public.comments,uuid,text);
drop function if exists comment_read_private.row_visible(public.comments,uuid,text);
drop schema if exists comment_read_private;
commit;
set lock_timeout = '2s';
set statement_timeout = '5min';
drop index concurrently if exists public.comments_thread_page_v2_idx;
reset lock_timeout;
reset statement_timeout;
