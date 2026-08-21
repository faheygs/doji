import fs from 'node:fs';
import path from 'node:path';

const source = (file: string) => fs.readFileSync(path.join(process.cwd(), file), 'utf8');

describe('auth signup flow contract', () => {
  it('makes both legal documents independently tappable on public auth surfaces', () => {
    const links = source('components/auth/AuthLegalLinks.tsx');
    const welcome = source('app/(auth)/welcome.tsx');
    const login = source('app/(auth)/login.tsx');

    expect(links).toContain("router.push('/(auth)/terms')");
    expect(links).toContain("router.push('/(auth)/privacy')");
    expect(welcome).toContain('<AuthLegalLinks');
    expect(login).toContain('<AuthLegalLinks');
  });

  it('collects and validates birthday before rendering signup credentials', () => {
    const login = source('app/(auth)/login.tsx');
    expect(login).toContain("signupStep === 'age'");
    expect(login).toContain('<SignupAgeStep');
    expect(login).toContain("setSignupStep('credentials')");
    expect(login).toContain('birth_date: birthDateAssessment.ok');
  });

  it('keeps the two legal consents in one compact group', () => {
    const login = source('app/(auth)/login.tsx');
    expect(login).toContain('<View style={styles.consents}>');
    expect(login).toContain('consents:');
    expect(login).toContain('gap: 0');
  });

  it('uses signup metadata during normal profile setup and only shows legacy fallback', () => {
    const username = source('app/(auth)/username.tsx');
    expect(username).toContain('session?.user?.user_metadata?.birth_date');
    expect(username).toContain('needsLegacyAgeFallback ?');
    expect(username).toContain('<LegacyAgeFallbackInput');
  });
});
