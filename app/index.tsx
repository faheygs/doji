import { Redirect } from 'expo-router';
import { useAuthStore } from '../stores/useAuthStore';
import { resolveAuthenticatedRoute } from '../lib/authRoute';
import { useAuthGate } from '../hooks/useAuthGate';

/** Cold-start entry at `/` — send to the correct group once auth is ready. */
export default function RootIndex() {
  const { session, profile } = useAuthStore();
  const { ready } = useAuthGate();

  if (!ready) {
    return null;
  }

  return <Redirect href={resolveAuthenticatedRoute(session, profile)} />;
}
