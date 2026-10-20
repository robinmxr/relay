import { useCallback, useEffect, useState } from 'react';
import type { MeResponse, UserSettings } from '@relay/shared';
import { api, ApiError, tokenStore } from './api';
import { SetPassword } from './ui/SetPassword';
import { SignIn } from './ui/SignIn';
import { Workspace } from './Workspace';

type Session = { token: string; me: MeResponse };

const THEME_KEY = 'relay.theme';

/** Mirrors the server setting locally so the theme paints before anything loads. */
function storedTheme(): UserSettings['theme'] {
  try {
    const v = localStorage.getItem(THEME_KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}

function applyTheme(theme: UserSettings['theme']): void {
  if (theme === 'system') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', theme);
}

const DEFAULT_PREFS: UserSettings = { theme: storedTheme(), sound: true, desktopNotifications: true, notifyLevel: 'all' };

export function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [checking, setChecking] = useState(() => tokenStore.get() !== null);
  const [error, setError] = useState<string | null>(null);
  const [prefs, setPrefs] = useState<UserSettings>(DEFAULT_PREFS);

  // Paint the stored theme immediately, before the session or settings arrive.
  useEffect(() => applyTheme(prefs.theme), []); // eslint-disable-line react-hooks/exhaustive-deps

  /** Builds the session from the server's view of /me, so it carries passwordSet. */
  const startSession = useCallback(async (token: string) => {
    tokenStore.set(token);
    setChecking(true);
    setError(null);
    try {
      const [me, settings] = await Promise.all([
        api<MeResponse>('/me'),
        api<UserSettings>('/me/settings').catch(() => null), // Preferences are not worth blocking sign-in over.
      ]);
      setSession({ token, me });
      if (settings) {
        setPrefs(settings);
        applyTheme(settings.theme);
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) tokenStore.clear();
      else setError('Cannot reach the Relay server.');
    } finally {
      setChecking(false);
    }
  }, []);

  const restore = useCallback(() => {
    const token = tokenStore.get();
    if (token) void startSession(token);
  }, [startSession]);

  useEffect(restore, [restore]);

  const signOut = useCallback(() => {
    // api() reads the token before it is cleared below.
    void api('/auth/signout', { method: 'POST' }).catch(() => {});
    tokenStore.clear();
    setSession(null);
  }, []);

  /** Saves a preferences change everywhere: server, memory, and the theme mirror. */
  const updatePrefs = useCallback(async (patch: Partial<UserSettings>) => {
    const next = await api<UserSettings>('/me/settings', { method: 'PATCH', body: patch });
    setPrefs(next);
    if (patch.theme !== undefined) {
      applyTheme(next.theme);
      try {
        localStorage.setItem(THEME_KEY, next.theme);
      } catch {
        // Storage blocked; the theme lasts until reload.
      }
    }
    return next;
  }, []);

  if (session) {
    // An account that predates passwords — or still has the default one — must set a real password first.
    if (!session.me.passwordSet || session.me.mustChange) {
      return (
        <SetPassword
          mustChange={session.me.mustChange}
          onDone={() => setSession({ ...session, me: { ...session.me, passwordSet: true, mustChange: false } })}
          onSignOut={signOut}
        />
      );
    }
    return <Workspace key={session.token} token={session.token} me={session.me} prefs={prefs} onPrefsChange={updatePrefs} onSignOut={signOut} />;
  }
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
  return <SignIn onSignedIn={(token) => void startSession(token)} />;
}
