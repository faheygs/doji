-- Bounded, read-only diagnostic. No Auth fields, receipts or member writes.
begin read only;
set local statement_timeout='4s';
select s.id,s.kind,s.body,s.options,s.created_at,s.status,
  r.challenge_id,c.type as challenge_type,c.title as challenge_title,
  c.answer_rule as challenge_answer_rule,c.requires_text,c.requires_photo,
  (select jsonb_agg(o.text order by o.position) from public.poll_options o where o.challenge_id=c.id) as challenge_choices
from public.challenge_suggestions s
left join public.admin_suggestion_reviews r on r.suggestion_id=s.id
left join public.challenges c on c.id=r.challenge_id
order by s.created_at desc limit 25;
rollback;
