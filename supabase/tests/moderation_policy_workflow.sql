begin;

select plan(25);

select has_column('public', 'posts', 'moderation_status', 'posts have server-owned moderation visibility');
select has_column('public', 'comments', 'moderation_status', 'comments have server-owned moderation visibility');
select has_column('public', 'poll_votes', 'moderation_status', 'poll responses have server-owned moderation visibility');
select has_table('public', 'moderation_decisions', 'immutable policy decisions are stored');
select has_table('public', 'moderation_account_actions', 'warnings and account actions are stored separately');
select has_table('public', 'moderation_notices', 'member notices are durable');
select has_table('public', 'moderation_appeals', 'appeals are server owned');
select has_column('public', 'admin_report_triage', 'queue', 'reports can enter restricted safety review');
select has_function('public', 'get_my_moderation_status', array[]::text[], 'members have a narrow account-status read');
select has_function('public', 'submit_moderation_appeal', array['uuid', 'text', 'text'], 'appeals use one atomic command');
select has_function('public', 'get_admin_report_case_v2', array['uuid'], 'classified case review has a bounded read');
select has_function('public', 'admin_decide_report_v2', array['uuid', 'text', 'text', 'text', 'text', 'text', 'text'], 'classified decisions use one atomic command');
select has_function('public', 'get_admin_appeals_snapshot', array['integer'], 'appeals have a bounded operator queue');
select has_function('public', 'admin_review_moderation_appeal', array['uuid', 'text', 'text', 'text'], 'appeal review is atomic');
select alike(pg_get_functiondef('public.admin_decide_report_v2(uuid,text,text,text,text,text,text)'::regprocedure), '%moderation_status = ''removed''%', 'content removal is a reversible state transition');
select unalike(pg_get_functiondef('public.admin_decide_report_v2(uuid,text,text,text,text,text,text)'::regprocedure), '%delete from public.posts%', 'classified enforcement never hard deletes posts');
select alike(pg_get_functiondef('public.admin_decide_report_v2(uuid,text,text,text,text,text,text)'::regprocedure), '%''warning''%', 'routine removal issues an account warning');
select alike(pg_get_functiondef('public.admin_decide_report_v2(uuid,text,text,text,text,text,text)'::regprocedure), '%restricted_safety%', 'serious cases can be quarantined into restricted review');
select alike(pg_get_functiondef('public.admin_review_moderation_appeal(uuid,text,text,text)'::regprocedure), '%Appeals must be reviewed by a different operator%', 'appeal reviewer independence is enforced');
select alike(pg_get_functiondef('public.admin_review_moderation_appeal(uuid,text,text,text)'::regprocedure), '%moderation_status = ''visible''%', 'successful appeals restore affected content');
select alike(pg_get_functiondef('public.get_feed_page_snapshot_v2(uuid,text,integer,timestamptz,uuid)'::regprocedure), '%moderation_status = ''visible''%', 'feed snapshots exclude hidden content');
select alike(pg_get_functiondef('public.get_comment_thread_snapshot(uuid,text,timestamptz,uuid,integer)'::regprocedure), '%moderation_status = ''visible''%', 'comment snapshots exclude hidden comments');
select alike(pg_get_functiondef('public.can_read_post_media(text,uuid)'::regprocedure), '%restricted_safety%', 'restricted media requires the restricted evidence path');
select ok(not has_function_privilege('anon', 'public.get_my_moderation_status()', 'execute'), 'anonymous users cannot read account status');
select ok(not has_function_privilege('anon', 'public.admin_review_moderation_appeal(uuid,text,text,text)', 'execute'), 'anonymous users cannot decide appeals');

select * from finish();
rollback;
