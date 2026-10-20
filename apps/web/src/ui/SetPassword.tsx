import { useState, type FormEvent } from 'react';
import { api } from '../api';

/**
 * Shown after sign-in to an account that predates passwords (or was given the
 * default starting password). Sets a real one and issues a recovery code.
 */
export function SetPassword({ mustChange, onDone, onSignOut }: { mustChange: boolean; onDone: () => void; onSignOut: () => void }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      setError('The two passwords do not match');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ recoveryCode: string }>('/me/password', { body: { password } });
      setCode(res.recoveryCode);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the password');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="signin">
      <div className="brand">
        <svg width="36" height="36" viewBox="0 0 36 36" aria-hidden="true">
          <rect width="36" height="36" rx="9" fill="var(--accent)" />
          <path d="M10 13h11a5 5 0 0 1 0 10h-3l-5 4v-4h-3z" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinejoin="round" />
        </svg>
        <span>Relay</span>
      </div>
      {code ? (
        <>
          <h1>Save your recovery code</h1>
          <div className="card signin-card">
            <p className="muted">Your password is set. This recovery code is the only way back in if you forget it — save it now.</p>
            <p className="recovery-code">{code}</p>
            <button
              className="btn"
              type="button"
              onClick={() => {
                navigator.clipboard
                  .writeText(code)
                  .then(() => setCopied(true))
                  .catch(() => {});
              }}
            >
              {copied ? 'Copied' : 'Copy code'}
            </button>
            <label className="field check">
              <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} /> I have saved it somewhere safe
            </label>
            <button className="btn primary block" type="button" disabled={!saved} onClick={onDone}>
              Continue
            </button>
          </div>
        </>
      ) : (
        <>
          <h1>Secure your account</h1>
          <form className="card signin-card" onSubmit={submit}>
            <p className="muted">
              {mustChange
                ? 'You are signed in with the shared starting password. Set your own so nobody else can sign in as you.'
                : 'Your account has no password yet. Set one so nobody else can sign in as you.'}
            </p>
            <label className="field">
              New password
              <input type="password" required minLength={8} autoFocus value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" autoComplete="new-password" />
            </label>
            <label className="field">
              Repeat password
              <input type="password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="The same password again" autoComplete="new-password" />
            </label>
            <button className="btn primary block" type="submit" disabled={busy}>
              {busy ? 'Saving…' : 'Set password'}
            </button>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <p className="muted small">
              <a href="#" onClick={(e) => { e.preventDefault(); onSignOut(); }}>
                Sign out instead
              </a>
            </p>
          </form>
        </>
      )}
    </div>
  );
}
