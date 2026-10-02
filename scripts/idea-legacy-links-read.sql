begin read only;
set local statement_timeout='4s';
select jsonb_build_object('receipt_bytes',pg_total_relation_size('public.command_receipts'),
 'records',(select jsonb_agg(x) from (
 select s.id,s.reviewed_at,s.reviewed_by is not null as reviewer_retained,
 (select count(*) from public.command_receipts r where r.user_id=s.reviewed_by and r.result->>'id'=s.id::text and r.result->>'status'='approved' and r.result->>'challenge_id' is not null) as approval_receipts,
 (select count(*) from public.challenges c where c.description=s.body) as exact_body_candidates
 from public.challenge_suggestions s left join public.admin_suggestion_reviews a on a.suggestion_id=s.id
 where s.status='approved' and a.challenge_id is null order by s.created_at limit 10
 ) x)) as legacy_link_check;
rollback;
