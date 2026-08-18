import fs from 'node:fs';
import path from 'node:path';

const migration = fs.readFileSync(
  path.join(
    process.cwd(),
    'supabase/migrations/20260818090000_profile_privacy_and_age_assurance.sql',
  ),
  'utf8',
);

describe('server-authoritative age assurance', () => {
  it('removes the profile-creation overloads that did not require age input', () => {
    expect(migration).toContain(
      'drop function if exists public.create_own_profile(text, text, text[], text, text);',
    );
    expect(migration).toContain('p_birth_date date');
  });

  it('checks the 13+ boundary in the submitted timezone', () => {
    expect(migration).toContain('pg_catalog.pg_timezone_names');
    expect(migration).toContain('clock_timestamp() at time zone normalized_timezone');
    expect(migration).toContain("local_today - interval '13 years'");
    expect(migration).toContain("raise exception 'You must be at least 13 to use Doji'");
  });

  it('stores only the private assurance result, not the submitted birth date', () => {
    expect(migration).toContain('create table if not exists public.age_assurances');
    expect(migration).toContain('revoke all on table public.age_assurances');
    expect(migration).toContain("'self_declared_birth_date'");

    const profileInsert = migration.slice(
      migration.indexOf('insert into public.profiles ('),
      migration.indexOf('return to_jsonb(profile_row);'),
    );
    expect(profileInsert).not.toContain('p_birth_date');
  });
});
