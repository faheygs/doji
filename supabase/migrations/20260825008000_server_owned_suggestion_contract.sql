-- Challenge suggestions are untrusted UGC. The database owns their shape,
-- bounded size, objectionable-content check, and dedupe identity; the client
-- hash remains in the RPC signature only for backwards compatibility.

update public.challenge_suggestions suggestion
set body_hash = 'migration:' || suggestion.id::text;

with ranked as (
  select
    suggestion.id,
    encode(
      extensions.digest(
        jsonb_build_object(
          'kind', suggestion.kind,
          'body', lower(regexp_replace(btrim(suggestion.body), '\s+', ' ', 'g')),
          'options', coalesce(suggestion.options, '[]'::jsonb)
        )::text,
        'sha256'
      ),
      'hex'
    ) as canonical_hash,
    row_number() over (
      partition by
        suggestion.kind,
        lower(regexp_replace(btrim(suggestion.body), '\s+', ' ', 'g')),
        coalesce(suggestion.options, '[]'::jsonb)
      order by suggestion.created_at, suggestion.id
    ) as duplicate_number
  from public.challenge_suggestions suggestion
), values_to_store as (
  select
    ranked.id,
    case
      when ranked.duplicate_number = 1 then ranked.canonical_hash
      else ranked.canonical_hash || ':' || ranked.id::text
    end as body_hash
  from ranked
)
update public.challenge_suggestions suggestion
set body_hash = values_to_store.body_hash
from values_to_store
where values_to_store.id = suggestion.id;

create or replace function public.submit_challenge_suggestion(
  p_kind text,
  p_body text,
  p_body_hash text,
  p_options jsonb,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  suggestion_row public.challenge_suggestions%rowtype;
  saved jsonb;
  normalized_body text := btrim(p_body);
  normalized_options jsonb := coalesce(p_options, '[]'::jsonb);
  server_hash text;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if p_idempotency_key is null or length(p_idempotency_key) < 16 then
    raise exception 'Invalid idempotency key';
  end if;
  if p_kind not in ('poll', 'wyr', 'question', 'photo_idea', 'format_question') then
    raise exception 'Invalid suggestion kind';
  end if;
  if length(normalized_body) < 8 or length(normalized_body) > 500 then
    raise exception 'Invalid suggestion';
  end if;
  if octet_length(normalized_options::text) > 8192 then
    raise exception 'Suggestion options are too large';
  end if;

  if p_kind in ('poll', 'wyr') then
    if jsonb_typeof(normalized_options) is distinct from 'array' then
      raise exception 'Invalid suggestion options';
    end if;
    if jsonb_array_length(normalized_options) < 2
      or jsonb_array_length(normalized_options) > 8
      or (p_kind = 'wyr' and jsonb_array_length(normalized_options) <> 2)
    then
      raise exception 'Invalid suggestion options';
    end if;
    if exists (
      select 1
      from jsonb_array_elements(normalized_options) option_value
      where jsonb_typeof(option_value) is distinct from 'string'
        or length(btrim(option_value #>> '{}')) not between 1 and 100
    ) then
      raise exception 'Invalid suggestion options';
    end if;
  elsif p_kind in ('question', 'photo_idea') then
    if normalized_options <> '[]'::jsonb then
      raise exception 'This suggestion type does not accept options';
    end if;
  else
    if jsonb_typeof(normalized_options) is distinct from 'object'
      or jsonb_typeof(normalized_options->'answer_rule') is distinct from 'object'
      or coalesce(normalized_options->'answer_rule'->>'type', '')
        not in ('starts_with_letter', 'exact_word_count')
    then
      raise exception 'Invalid format rule';
    end if;
    if normalized_options->'answer_rule'->>'type' = 'starts_with_letter'
      and coalesce(normalized_options->'answer_rule'->>'letter', '') !~ '^[A-Za-z]$'
    then
      raise exception 'Invalid format rule';
    end if;
    if normalized_options->'answer_rule'->>'type' = 'exact_word_count' then
      if coalesce(normalized_options->'answer_rule'->>'count', '') !~ '^[0-9]+$' then
        raise exception 'Invalid format rule';
      end if;
      if (normalized_options->'answer_rule'->>'count')::integer not between 1 and 20 then
        raise exception 'Invalid format rule';
      end if;
    end if;
  end if;

  perform public.assert_acceptable_content(normalized_body);
  perform public.assert_acceptable_content(normalized_options::text);

  -- Intentionally ignore p_body_hash: it is caller-controlled and therefore
  -- cannot be an authoritative dedupe key.
  server_hash := encode(
    extensions.digest(
      jsonb_build_object(
        'kind', p_kind,
        'body', lower(regexp_replace(normalized_body, '\s+', ' ', 'g')),
        'options', normalized_options
      )::text,
      'sha256'
    ),
    'hex'
  );

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(uid::text || ':submit_challenge_suggestion:' || p_idempotency_key, 0)
  );
  select receipt.result into saved
  from public.command_receipts receipt
  where receipt.user_id = uid
    and receipt.idempotency_key = p_idempotency_key;
  if found then return saved; end if;

  insert into public.challenge_suggestions (user_id, kind, body, body_hash, options)
  values (uid, p_kind, normalized_body, server_hash, normalized_options)
  on conflict (body_hash) do nothing
  returning * into suggestion_row;

  if suggestion_row.id is null then
    raise exception 'This suggestion already exists';
  end if;

  saved := to_jsonb(suggestion_row);
  insert into public.command_receipts (user_id, idempotency_key, result)
  values (uid, p_idempotency_key, saved);
  return saved;
end;
$$;

revoke all on function public.submit_challenge_suggestion(text, text, text, jsonb, text)
  from public, anon;
grant execute on function public.submit_challenge_suggestion(text, text, text, jsonb, text)
  to authenticated;

comment on function public.submit_challenge_suggestion(text, text, text, jsonb, text) is
  'Validates, filters, bounds, hashes, deduplicates, and atomically stores challenge suggestion UGC.';
