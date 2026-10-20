import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { MeResponse, SessionInfo, User, UserSettings } from '@relay/shared';
import { api, uploadAvatar } from '../api';
import type { SettingsTab } from '../routes';
import { Avatar } from './Avatar';
import { Flash } from './Flash';
import { Page } from './Page';

const TABS: { id: SettingsTab; label: string }[] = [
  { id: 'profile', label: 'Profile' },
  { id: 'notifications', label: 'Notifications' },
  { id: 'appearance', label: 'Appearance' },
  { id: 'security', label: 'Security' },
];

function describeAgent(ua: string | null): string {
  if (!ua) return 'Unknown device';
  const browser = /Firefox\/(\S+)/.exec(ua)?.[1]
    ? `Firefox ${/Firefox\/(\S+)/.exec(ua)?.[1].split('.')[0]}`
    : /Edg\/(\S+)/.exec(ua)?.[1]
      ? `Edge ${/Edg\/(\S+)/.exec(ua)?.[1].split('.')[0]}`
      : /Chrome\/(\S+)/.exec(ua)?.[1]
        ? `Chrome ${/Chrome\/(\S+)/.exec(ua)?.[1].split('.')[0]}`
        : /Version\/(\S+).*Safari/.exec(ua)?.[1]
          ? `Safari ${/Version\/(\S+).*Safari/.exec(ua)?.[1].split('.')[0]}`
          : 'Browser';
  const os = /Mac OS X[^\)]*\)/.test(ua) ? 'macOS' : /Windows/.test(ua) ? 'Windows' : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Linux/.test(ua) ? 'Linux' : '';
  return os ? `${browser} on ${os}` : browser;
}

export function Settings({
  me,
  prefs,
  onPrefsChange,
  onMeChange,
  tab,
  onTabChange,
  onBack,
  onSignOut,
}: {
  me: User;
  prefs: UserSettings;
  onPrefsChange: (patch: Partial<UserSettings>) => Promise<unknown>;
  onMeChange: (me: User) => void;
  /** The section comes from the URL, so it survives refresh and browser Back. */
  tab: SettingsTab;
  onTabChange: (tab: SettingsTab) => void;
  onBack: () => void;
  onSignOut: () => void;
}) {
  return (
    <Page
      label="Settings"
      title="Settings"
      subtitle="Your account, notifications and how Relay looks"
      onBack={onBack}
      nav={TABS.map((t) => (
        <button
          key={t.id}
          className={`page-nav-item${tab === t.id ? ' active' : ''}`}
          aria-current={tab === t.id ? 'page' : undefined}
          onClick={() => onTabChange(t.id)}
        >
          {t.label}
        </button>
      ))}
    >
      {tab === 'profile' && <ProfileTab me={me} onMeChange={onMeChange} />}
      {tab === 'notifications' && <PrefsTab prefs={prefs} onPrefsChange={onPrefsChange} />}
      {tab === 'appearance' && <AppearanceTab prefs={prefs} onPrefsChange={onPrefsChange} />}
      {tab === 'security' && <SecurityTab onSignOut={onSignOut} />}
    </Page>
  );
}

function ProfileTab({ me, onMeChange }: { me: User; onMeChange: (me: User) => void }) {
  const [name, setName] = useState(me.name);
  const [busy, setBusy] = useState(false);
  const [nameSaved, setNameSaved] = useState(false);
  const [statusSaved, setStatusSaved] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [avatarFlash, setAvatarFlash] = useState<'set' | 'removed' | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const [emoji, setEmoji] = useState(me.status?.emoji ?? '');
  const [statusText, setStatusText] = useState(me.status?.text ?? '');
  const [clearChoice, setClearChoice] = useState('forever');

  const saveName = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim() || name === me.name) return;
    setBusy(true);
    setNameError(null);
    setNameSaved(false);
    try {
      onMeChange(await api<MeResponse>('/me', { method: 'PATCH', body: { name: name.trim() } }));
      setNameSaved(true);
    } catch (err) {
      setNameError(err instanceof Error ? err.message : 'Could not save the name');
    } finally {
      setBusy(false);
    }
  };

  const saveStatus = async () => {
    setBusy(true);
    setStatusError(null);
    setStatusSaved(false);
    try {
      let expiresInMinutes: number | null = null;
      if (clearChoice === '30') expiresInMinutes = 30;
      else if (clearChoice === '60') expiresInMinutes = 60;
      else if (clearChoice === '240') expiresInMinutes = 240;
      else if (clearChoice === 'today') {
        // Minutes until local midnight, so "today" really means today.
        const end = new Date();
        end.setHours(24, 0, 0, 0);
        expiresInMinutes = Math.max(1, Math.ceil((end.getTime() - Date.now()) / 60_000));
      }
      const next = emoji.trim()
        ? await api<MeResponse>('/me', { method: 'PATCH', body: { status: { emoji: emoji.trim(), text: statusText.trim(), expiresInMinutes } } })
        : await api<MeResponse>('/me', { method: 'PATCH', body: { status: null } });
      onMeChange(next);
      setStatusSaved(true);
    } catch (err) {
      setStatusError(err instanceof Error ? err.message : 'Could not save the status');
    } finally {
      setBusy(false);
    }
  };

  const clearStatus = async () => {
    setBusy(true);
    setStatusError(null);
    setStatusSaved(false);
    try {
      onMeChange(await api<MeResponse>('/me', { method: 'PATCH', body: { status: null } }));
      setEmoji('');
      setStatusText('');
      setStatusSaved(true);
    } catch {
      setStatusError('Could not clear the status');
    } finally {
      setBusy(false);
    }
  };

  const pickAvatar = async (file: File | undefined) => {
    if (!file) return;
    setAvatarBusy(true);
    setAvatarError(null);
    setAvatarFlash(null);
    try {
      const { avatarUrl } = await uploadAvatar(file);
      onMeChange({ ...me, avatarUrl });
      setAvatarFlash('set');
    } catch (err) {
      setAvatarError(err instanceof Error ? err.message : 'Could not upload the avatar');
    } finally {
      setAvatarBusy(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const removeAvatar = async () => {
    setAvatarBusy(true);
    setAvatarError(null);
    setAvatarFlash(null);
    try {
      await api('/me/avatar', { method: 'DELETE' });
      onMeChange({ ...me, avatarUrl: null });
      setAvatarFlash('removed');
    } catch (err) {
      setAvatarError(err instanceof Error ? err.message : 'Could not remove the avatar');
    } finally {
      setAvatarBusy(false);
    }
  };

  return (
    <>
      <section>
        <h3>Avatar</h3>
        <div className="settings-avatar">
          <Avatar user={me} size={64} />
          <input ref={fileInput} type="file" accept="image/*" className="sr-only" onChange={(e) => void pickAvatar(e.target.files?.[0])} />
          <div className="settings-avatar-actions">
            <div className="settings-row-actions">
              <button className="btn small" disabled={avatarBusy} onClick={() => fileInput.current?.click()}>
                {avatarBusy ? 'Uploading…' : me.avatarUrl ? 'Replace' : 'Upload image'}
              </button>
              {me.avatarUrl && (
                <button className="btn small" disabled={avatarBusy} onClick={() => void removeAvatar()}>
                  Remove
                </button>
              )}
              <Flash key={String(avatarFlash)} visible={avatarFlash !== null}>
                <span className="flash ok">{avatarFlash === 'removed' ? 'Avatar removed' : 'Avatar updated'}</span>
              </Flash>
            </div>
            <p className="hint">PNG, JPEG, GIF or WebP, up to 2 MB.</p>
            {avatarError && (
              <p className="form-error" role="alert">
                {avatarError}
              </p>
            )}
          </div>
        </div>
      </section>

      <section>
        <h3>Display name</h3>
        <form className="settings-row" onSubmit={(e) => void saveName(e)}>
          <input className="input" required maxLength={80} value={name} onChange={(e) => { setName(e.target.value); setNameSaved(false); }} />
          <button className="btn small primary" type="submit" disabled={busy || !name.trim() || name === me.name}>
            Save
          </button>
          <Flash key={String(nameSaved)} visible={nameSaved}>
            <span className="flash ok">Saved</span>
          </Flash>
        </form>
        {nameError && (
          <p className="form-error" role="alert">
            {nameError}
          </p>
        )}
        <p className="hint">Account: {me.email}</p>
      </section>

      <section>
        <h3>Status</h3>
        <p className="hint">Shown next to your name. Try 🎧 in a huddle, 🌴 on vacation.</p>
        <div className="settings-status">
          <input
            className="input emoji"
            aria-label="Status emoji"
            placeholder="🎧"
            maxLength={16}
            value={emoji}
            onChange={(e) => { setEmoji(e.target.value); setStatusSaved(false); }}
          />
          <input
            className="input"
            aria-label="Status text"
            placeholder="In a huddle"
            maxLength={80}
            value={statusText}
            onChange={(e) => { setStatusText(e.target.value); setStatusSaved(false); }}
          />
          <select className="input" aria-label="Clear status after" value={clearChoice} onChange={(e) => setClearChoice(e.target.value)}>
            <option value="forever">Until I clear it</option>
            <option value="30">30 minutes</option>
            <option value="60">1 hour</option>
            <option value="240">4 hours</option>
            <option value="today">Today</option>
          </select>
          <button className="btn small primary" disabled={busy} onClick={() => void saveStatus()}>
            Set
          </button>
          {me.status && (
            <button className="btn small" disabled={busy} onClick={() => void clearStatus()}>
              Clear
            </button>
          )}
          <Flash key={String(statusSaved)} visible={statusSaved}>
            <span className="flash ok">Saved</span>
          </Flash>
        </div>
        <p className="hint">{me.status ? `Current: ${me.status.emoji} ${me.status.text || 'set'}` : 'No status set'}</p>
        {statusError && (
          <p className="form-error" role="alert">
            {statusError}
          </p>
        )}
      </section>
    </>
  );
}

function PrefsTab({ prefs, onPrefsChange }: { prefs: UserSettings; onPrefsChange: (patch: Partial<UserSettings>) => Promise<unknown> }) {
  const [error, setError] = useState<string | null>(null);
  const update = (patch: Partial<UserSettings>) => void onPrefsChange(patch).catch(() => setError('Could not save, try again'));

  return (
    <>
      {prefs.desktopNotifications && 'Notification' in window && Notification.permission === 'default' && (
        <button className="btn small" onClick={() => void Notification.requestPermission()}>
          Allow notifications in the browser
        </button>
      )}
      <label className="settings-row setting-toggle">
        <span>
          Sounds
          <span className="hint">A chime when someone calls you</span>
        </span>
        <input type="checkbox" checked={prefs.sound} onChange={(e) => update({ sound: e.target.checked })} />
      </label>
      <label className="settings-row setting-toggle">
        <span>
          Desktop notifications
          <span className="hint">Pop-ups for new messages while the tab is hidden</span>
        </span>
        <input type="checkbox" checked={prefs.desktopNotifications} onChange={(e) => update({ desktopNotifications: e.target.checked })} />
      </label>
      <section>
        <h3>Notify me for</h3>
        <label className="field check">
          <input type="radio" name="notify-level" checked={prefs.notifyLevel === 'all'} onChange={() => update({ notifyLevel: 'all' })} />
          Every message
        </label>
        <label className="field check">
          <input type="radio" name="notify-level" checked={prefs.notifyLevel === 'mentions'} onChange={() => update({ notifyLevel: 'mentions' })} />
          Mentions and direct messages only
        </label>
      </section>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </>
  );
}

function AppearanceTab({ prefs, onPrefsChange }: { prefs: UserSettings; onPrefsChange: (patch: Partial<UserSettings>) => Promise<unknown> }) {
  const themes: { id: UserSettings['theme']; label: string }[] = [
    { id: 'system', label: 'Match my system' },
    { id: 'light', label: 'Light' },
    { id: 'dark', label: 'Dark' },
  ];
  return (
    <section>
      <h3>Theme</h3>
      {themes.map((t) => (
        <label key={t.id} className="field check">
          <input type="radio" name="theme" checked={prefs.theme === t.id} onChange={() => void onPrefsChange({ theme: t.id }).catch(() => {})} />
          {t.label}
        </label>
      ))}
    </section>
  );
}

function SecurityTab({ onSignOut }: { onSignOut: () => void }) {
  const [sessions, setSessions] = useState<SessionInfo[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentPassword, setCurrentPassword] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [code, setCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const loadSessions = async () => {
    try {
      setSessions(await api<SessionInfo[]>('/me/sessions'));
    } catch {
      setError('Could not load sessions');
    }
  };
  useEffect(() => void loadSessions(), []); // eslint-disable-line react-hooks/exhaustive-deps

  const revoke = async (id: string) => {
    await api(`/me/sessions/${id}`, { method: 'DELETE' }).catch(() => {});
    void loadSessions();
  };

  const revokeOthers = async () => {
    setBusy(true);
    await api('/me/sessions/revoke-others', { method: 'POST' }).catch(() => {});
    void loadSessions();
    setBusy(false);
  };

  const changePassword = async (e: FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      setError('The two passwords do not match');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ recoveryCode: string }>('/me/password', { body: { currentPassword: currentPassword || undefined, password } });
      setCode(res.recoveryCode);
      setCurrentPassword('');
      setPassword('');
      setConfirm('');
      void loadSessions(); // Other devices were signed out.
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not change the password');
    } finally {
      setBusy(false);
    }
  };

  if (code) {
    return (
      <section>
        <h3>Save your new recovery code</h3>
        <p className="hint">Your password is set. This recovery code is the only way back in if you forget it — save it now.</p>
        <p className="recovery-code">{code}</p>
        <button
          className="btn small"
          type="button"
          onClick={() => {
            navigator.clipboard.writeText(code).then(() => setCopied(true)).catch(() => {});
          }}
        >
          {copied ? 'Copied' : 'Copy code'}
        </button>
        <button className="btn small primary" type="button" onClick={() => setCode(null)}>
          Done
        </button>
      </section>
    );
  }

  return (
    <>
      <section>
        <h3>Change password</h3>
        <form className="settings-form" onSubmit={(e) => void changePassword(e)}>
          <label className="field">
            Current password
            <input type="password" required value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} autoComplete="current-password" />
          </label>
          <label className="field">
            New password
            <input type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
          </label>
          <label className="field">
            Repeat new password
            <input type="password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
          </label>
          <button className="btn small primary" type="submit" disabled={busy}>
            {busy ? 'Saving…' : 'Change password'}
          </button>
        </form>
      </section>

      <section>
        <h3>Signed-in devices</h3>
        {sessions === null ? (
          <p className="hint">Loading…</p>
        ) : (
          <>
            {sessions.map((s) => (
              <div key={s.id} className="session-row">
                <div>
                  <div className="session-device">
                    {describeAgent(s.userAgent)}
                    {s.current && <span className="pill current">This device</span>}
                  </div>
                  <div className="session-meta">
                    Last seen <time dateTime={s.lastSeenAt}>{new Date(s.lastSeenAt).toLocaleString()}</time>
                  </div>
                </div>
                {!s.current && (
                  <button className="btn small" onClick={() => void revoke(s.id)}>
                    Sign out
                  </button>
                )}
              </div>
            ))}
            {sessions.length > 1 && (
              <button className="btn small" disabled={busy} onClick={() => void revokeOthers()}>
                Sign out other devices
              </button>
            )}
            <p className="hint">
              Signing out a device takes effect the next time it reconnects; already-open tabs keep running until then.
            </p>
            <button className="btn small" onClick={onSignOut}>
              Sign out everywhere (this device too)
            </button>
          </>
        )}
      </section>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </>
  );
}
