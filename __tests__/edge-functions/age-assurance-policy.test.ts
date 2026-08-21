import fs from 'node:fs';
import path from 'node:path';

const migration = fs.readFileSync(
  path.join(
    process.cwd(),
    'supabase/migrations/20260818090000_profile_privacy_and_age_assurance.sql',
  ),
  'utf8',
);
const preAuthMigration = fs.readFileSync(
  path.join(process.cwd(), 'supabase/migrations/20260820020000_pre_auth_minimum_age.sql'),
  'utf8',
);
const authConfig = fs.readFileSync(path.join(process.cwd(), 'supabase/config.toml'), 'utf8');
const retainedBirthDateMigration = fs.readFileSync(
  path.join(process.cwd(), 'supabase/migrations/20260820030000_retain_asserted_birth_date.sql'),
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

  it('keeps age assurance data private and out of the public profile', () => {
    expect(migration).toContain('create table if not exists public.age_assurances');
    expect(migration).toContain('revoke all on table public.age_assurances');
    expect(migration).toContain("'self_declared_birth_date'");

    const profileInsert = migration.slice(
      migration.indexOf('insert into public.profiles ('),
      migration.indexOf('return to_jsonb(profile_row);'),
    );
    expect(profileInsert).not.toContain('p_birth_date');
  });

  it('rejects missing and under-13 birth dates before auth user creation', () => {
    expect(preAuthMigration).toContain('hook_enforce_minimum_signup_age');
    expect(preAuthMigration).toContain("event->'user'->'user_metadata'->>'birth_date'");
    expect(preAuthMigration).toContain("today_utc - interval '13 years'");
    expect(preAuthMigration).toContain('to supabase_auth_admin');
    expect(authConfig).toContain('[auth.hook.before_user_created]');
    expect(authConfig).toContain('hook_enforce_minimum_signup_age');
  });

  it('retains the asserted date in the private assurance before removing its auth duplicate', () => {
    expect(retainedBirthDateMigration).toContain('asserted_birth_date date');
    expect(retainedBirthDateMigration).toContain(
      'assessed_at, asserted_birth_date',
    );
    expect(retainedBirthDateMigration).toContain(
      'asserted_birth_date = excluded.asserted_birth_date',
    );
    expect(retainedBirthDateMigration).toContain(
      'revoke all on table public.age_assurances from public, anon, authenticated',
    );
    expect(preAuthMigration).toContain("raw_user_meta_data, '{}'::jsonb) - 'birth_date'");
    expect(preAuthMigration).toContain('after insert or update of age_band');
  });
});
