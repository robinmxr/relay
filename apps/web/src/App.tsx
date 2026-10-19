import { useCallback, useEffect, useState } from 'react';
import type { User } from '@relay/shared';
import { api, ApiError, tokenStore } from './api';
import { SignIn } from './ui/SignIn';
import { Workspace } from './Workspace';

type Session = { token: string; me: User };

export function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [checking, setChecking] = useState(() => tokenStore.get() !== null);
  const [error, setError] = useState<string | null>(null);

  const restore = useCallback(() => {
    const token = tokenStore.get();
    if (!token) return;
    setChecking(true);
    setError(null);
    api<User>('/me')
      .then((me) => setSession({ token, me }))
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) tokenStore.clear();
        else setError('Cannot reach the Relay server.');
      })
      .finally(() => setChecking(false));
  }, []);

  useEffect(restore, [restore]);

  const signOut = useCallback(() => {
    // api() reads the token before it is cleared below.
    void api('/auth/signout', { method: 'POST' }).catch(() => {});
    tokenStore.clear();
    setSession(null);
  }, []);

  if (session) return <Workspace key={session.token} token={session.token} me={session.me} onSignOut={signOut} />;
  if (error) {
    return (
      <div className="center-screen">
        <p>{error}</p>
        <button className="btn primary" onClick={restore}>
          Try again
        </button>
      </div>
    );
  }
  if (checking) return <div className="center-screen muted">Loading…</div>;
  return (
    <SignIn
      onSignedIn={(token, me) => {
        tokenStore.set(token);
        setSession({ token, me });
      }}
    />
  );
}
