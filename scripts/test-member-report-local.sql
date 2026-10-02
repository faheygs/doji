-- Run ONLY in the isolated synthetic local database. All writes roll back.
\set ON_ERROR_STOP on
begin;
set local statement_timeout = '8s';
set local lock_timeout = '2s';
do $$ begin
  if exists (select 1 from vault.secrets) or exists (
    select 1 from auth.users where email is null or email not like '%@test.invalid'
  ) then raise exception 'Synthetic local database required'; end if;
end $$;

do $$
declare
  author uuid := gen_random_uuid();
  viewer uuid := gen_random_uuid();
  challenge uuid := gen_random_uuid();
  event uuid := gen_random_uuid();
  participation uuid := gen_random_uuid();
  post uuid := gen_random_uuid();
  first_result jsonb;
  replay jsonb;
  receipt_key text := 'local-report-' || gen_random_uuid()::text;
begin
  insert into auth.users (id, email, role, aud)
  values (author, author::text || '@test.invalid', 'authenticated', 'authenticated'),
         (viewer, viewer::text || '@test.invalid', 'authenticated', 'authenticated');
  update auth.users set raw_user_meta_data = jsonb_build_object(
    'terms_version', '2026-08-20', 'privacy_version', '2026-08-20',
    'terms_accepted_at', now(), 'privacy_accepted_at', now()) where id in (author, viewer);
  insert into public.profiles (id, username, display_name)
  values (author, 'a' || left(replace(author::text, '-', ''), 16), 'Synthetic author'),
         (viewer, 'v' || left(replace(viewer::text, '-', ''), 16), 'Synthetic viewer');
  insert into public.challenges (id, title, description, category)
  values (challenge, 'Local report regression', 'Synthetic fixture only', 'creative');
  insert into public.daily_events (id, challenge_id, fires_at)
  values (event, challenge, now() - interval '2 minutes');
  insert into public.user_events (id, user_id, daily_event_id, status, expires_at)
  values (participation, author, event, 'completed', now() + interval '8 minutes'),
         (gen_random_uuid(), viewer, event, 'completed', now() + interval '8 minutes');
  insert into storage.buckets(id, name) values ('post-media', 'post-media') on conflict do nothing;
  insert into storage.objects(bucket_id, name, owner_id)
  values ('post-media', post::text || '.jpg', author::text);
  insert into public.media_upload_intents(user_id, user_event_id, idempotency_key, slot, object_path, content_type)
  values (author, participation, post::text, 'photo', post::text || '.jpg', 'image/jpeg');
  insert into public.posts (id, user_id, user_event_id, daily_event_id, idempotency_key, photo_url)
  values (post, author, participation, event, post::text,
    'https://test.invalid/storage/v1/object/public/post-media/' || post::text || '.jpg');
  perform set_config('request.jwt.claims', jsonb_build_object('sub', viewer, 'role', 'authenticated')::text, true);
  if not public.can_view_full_post(post, viewer) then raise exception 'Fixture must start visible'; end if;
  first_result := public.submit_policy_report(author, post, null, null, 'post',
    'violence_hate_exploitation', 'credible_threat', null, receipt_key);
  -- Treat the first response as lost and replay the same command.
  replay := public.submit_policy_report(author, post, null, null, 'post',
    'violence_hate_exploitation', 'credible_threat', null, receipt_key);
  if replay is distinct from first_result then raise exception 'Receipt replay changed'; end if;
  if (select count(*) from public.reports where post_id = post) <> 1 then raise exception 'Duplicate report'; end if;
  if (select count(*) from public.command_receipts where user_id = viewer and idempotency_key = receipt_key) <> 1
    then raise exception 'Receipt missing or duplicated'; end if;
  if (select moderation_status from public.posts where id = post) <> 'quarantined'
    then raise exception 'Critical target not quarantined'; end if;
  if public.can_view_full_post(post, viewer) or public.can_view_full_post(post, author)
    then raise exception 'Quarantined target still visible'; end if;
  if not exists (select 1 from public.admin_report_triage
    where report_id = (first_result->>'id')::uuid and priority = 'critical' and queue = 'restricted_safety')
    then raise exception 'Critical routing incorrect'; end if;
  raise notice 'PASS: exact receipt replay, one report, atomic critical quarantine, restricted routing, both viewers denied';
end $$;
rollback;
