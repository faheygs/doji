/** Maps Supabase Auth errors to short, user-facing copy. */
export function formatAuthError(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) {
    const msg = String((error as { message?: string }).message ?? '').trim();
    if (!msg) return defaultHint();

    const lower = msg.toLowerCase();
    if (lower.includes('email') && lower.includes('confirm')) {
      return 'Confirm your email, or disable “Confirm email” under Supabase → Authentication → Providers → Email.';
    }
    if (
      lower.includes('email') &&
      (lower.includes('disabled') ||
        lower.includes('provider') ||
        lower.includes('not enabled') ||
        lower.includes('signups'))
    ) {
      return 'Email sign-in is not allowed yet. In Supabase: Authentication → Providers → Email → enable sign-in.';
    }
    if (lower.includes('invalid') && lower.includes('email')) {
      return 'Invalid email address.';
    }
    if (
      lower.includes('invalid login') ||
      lower.includes('invalid credentials') ||
      (lower.includes('email') && lower.includes('password'))
    ) {
      return 'Wrong email or password.';
    }
    if (lower.includes('user already registered') || lower.includes('already been registered')) {
      return 'An account with this email already exists. Try signing in.';
    }
    return msg;
  }
  return defaultHint();
}

function defaultHint(): string {
  return 'Something went wrong. Check Supabase Auth → Email provider and rate limits.';
}

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export function isValidEmail(raw: string): boolean {
  const email = normalizeEmail(raw);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
