-- Preserve the deployed filter contract while removing a PL/pgSQL shadowed
-- loop-variable warning surfaced by `supabase db lint`.
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
begin
  if btrim(v_source) = '' then return; end if;

  for v_position in 1..char_length(v_source) loop
    v_character := substr(v_source, v_position, 1);
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
    raise exception using errcode = '22023', message = 'Content contains prohibited language';
  end if;

  foreach v_word in array regexp_split_to_array(v_normalized, ' ') loop
    if v_word = any(array[
      'fuck', 'fucker', 'fucking', 'shit', 'shitting', 'bullshit',
      'bitch', 'bitching', 'cunt', 'dick', 'prick', 'cock', 'pussy',
      'ass', 'asshole', 'bastard', 'whore', 'slut', 'piss', 'pissing',
      'wanker', 'twat', 'motherfucker', 'motherfucking', 'fag', 'spic',
      'coon', 'paki', 'niga', 'niger', 'nword', 'cword', 'fword'
    ]::text[]) then
      raise exception using errcode = '22023', message = 'Content contains prohibited language';
    end if;
  end loop;
end;
$$;

revoke all on function public.assert_acceptable_content(text) from public, anon, authenticated;
