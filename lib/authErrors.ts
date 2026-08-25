/** Maps Supabase Auth errors to short, user-facing copy. */
export function formatAuthError(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) {
    const msg = String((error as { message?: string }).message ?? '').trim();
    if (!msg) return defaultHint();

    const lower = msg.toLowerCase();
    if (lower.includes('email') && lower.includes('confirm')) {
      return 'Check your email and confirm your account, then try again.';
    }
    if (
      lower.includes('email') &&
      (lower.includes('disabled') ||
        lower.includes('provider') ||
        lower.includes('not enabled') ||
        lower.includes('signups'))
    ) {
      return 'Email sign-in is temporarily unavailable. Please try again later.';
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
    if (lower.includes('rate limit') || lower.includes('too many')) {
      return 'Too many attempts. Wait a moment and try again.';
    }
    if (lower.includes('network') || lower.includes('fetch')) {
      return 'Could not connect to Doji. Check your connection and try again.';
    }
    return 'Something went wrong. Please try again.';
  }
  return defaultHint();
}

function defaultHint(): string {
  return 'Something went wrong. Please try again.';
}

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export function isValidEmail(raw: string): boolean {
  const email = normalizeEmail(raw);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
