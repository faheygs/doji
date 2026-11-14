import Constants from 'expo-constants';
import { legalAcceptanceMetadata } from './legal';

/** Confirmation still precedes manual password sign-in; links never install a session. */
export function signupOptions(acceptedAt: string, birthDate: string | null) {
  const data = { ...legalAcceptanceMetadata(acceptedAt), birth_date: birthDate };
  if (process.env.EXPO_PUBLIC_APP_ENV !== 'staging') return { data };

  const variant = Constants.expoConfig?.extra?.dojiVariant;
  const scheme =
    variant === 'development' ? 'doji-dev' : variant === 'staging' ? 'doji-staging' : null;
  if (
    !scheme ||
    Constants.expoConfig?.scheme !== scheme ||
    process.env.EXPO_PUBLIC_SUPABASE_URL !== 'https://ohrcupagdoilkwhecict.supabase.co'
  ) {
    throw new Error('Staging account confirmation is not configured. Contact your developer.');
  }
  return { data, emailRedirectTo: `${scheme}://login` };
}
