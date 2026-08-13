-- Apple Guideline 1.2: objectionable text is rejected at the authoritative
-- database boundary. Client filtering remains a faster UX guard, but is not a
-- security boundary and cannot be the only protection.

create or replace function public.assert_acceptable_content(p_value text)
returns void
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_source text := lower(coalesce(p_value, ''));
  v_normalized text := '';
  v_compact text;
  v_character text;
  v_word text;
  v_index integer;
begin
  if btrim(v_source) = '' then
    return;
  end if;

  for v_index in 1..char_length(v_source) loop
    v_character := substr(v_source, v_index, 1);
    v_normalized := v_normalized || case v_character
      when '0' then 'o' when '1' then 'i' when '2' then 'z'
      when '3' then 'e' when '4' then 'a' when '5' then 's'
      when '6' then 'g' when '7' then 't' when '8' then 'b'
      when '9' then 'g' when '@' then 'a' when '$' then 's'
      when '!' then 'i' when '+' then 't' when '|' then 'l'
      when '(' then 'c' when ')' then 'o' when '<' then 'c'
      else case when v_character ~ '^[a-z]$' then v_character else ' ' end
    end;
  end loop;

  v_normalized := regexp_replace(v_normalized, '(.)\1{2,}', '\1', 'g');
  v_normalized := btrim(regexp_replace(v_normalized, '\s+', ' ', 'g'));
  v_compact := replace(v_normalized, ' ', '');

  if exists (
    select 1
    from unnest(array[
      'nigger', 'nigga', 'faggot', 'fagot', 'kike', 'wetback',
      'gook', 'chink', 'tranny', 'trany', 'retard'
    ]::text[]) prohibited
    where strpos(v_normalized, prohibited) > 0 or strpos(v_compact, prohibited) > 0
  ) then
    raise exception using
      errcode = '22023',
      message = 'Content contains prohibited language';
  end if;

  foreach v_word in array regexp_split_to_array(v_normalized, ' ') loop
    if v_word = any(array[
      'fuck', 'fucker', 'fucking', 'shit', 'shitting', 'bullshit',
      'bitch', 'bitching', 'cunt', 'dick', 'prick', 'cock', 'pussy',
      'ass', 'asshole', 'bastard', 'whore', 'slut', 'piss', 'pissing',
      'wanker', 'twat', 'motherfucker', 'motherfucking', 'fag', 'spic',
      'coon', 'paki', 'niga', 'niger', 'nword', 'cword', 'fword'
    ]::text[]) then
      raise exception using
        errcode = '22023',
        message = 'Content contains prohibited language';
    end if;
  end loop;
end;
$$;

revoke all on function public.assert_acceptable_content(text) from public, anon, authenticated;

create or replace function public.reject_objectionable_ugc()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_column text;
  v_value text;
begin
  foreach v_column in array tg_argv loop
    v_value := to_jsonb(new) ->> v_column;
    perform public.assert_acceptable_content(v_value);
  end loop;
  return new;
end;
$$;

revoke all on function public.reject_objectionable_ugc() from public, anon, authenticated;

drop trigger if exists reject_objectionable_comments on public.comments;
create trigger reject_objectionable_comments
before insert or update on public.comments
for each row execute function public.reject_objectionable_ugc('body');

drop trigger if exists reject_objectionable_posts on public.posts;
create trigger reject_objectionable_posts
before insert or update on public.posts
for each row execute function public.reject_objectionable_ugc('caption');

drop trigger if exists reject_objectionable_poll_votes on public.poll_votes;
create trigger reject_objectionable_poll_votes
before insert or update on public.poll_votes
for each row execute function public.reject_objectionable_ugc('custom_text');

drop trigger if exists reject_objectionable_suggestions on public.challenge_suggestions;
create trigger reject_objectionable_suggestions
before insert or update on public.challenge_suggestions
for each row execute function public.reject_objectionable_ugc('body', 'options');

drop trigger if exists reject_objectionable_profiles on public.profiles;
create trigger reject_objectionable_profiles
before insert or update on public.profiles
for each row execute function public.reject_objectionable_ugc('username', 'display_name', 'bio');

comment on function public.assert_acceptable_content(text) is
  'Authoritative objectionable-language filter for all user-submitted text.';
