import { useState, type FormEvent } from 'react';
import type { SignInResponse } from '@relay/shared';
import { api } from '../api';

type Mode = 'signin' | 'signup' | 'recover';

const HEADINGS: Record<Mode, string> = {
  signin: 'Sign in to your workspace',
  signup: 'Create your account',
  recover: 'Reset your password',
};

export function SignIn({ onSignedIn }: { onSignedIn: (token: string) => void }) {
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** After signup or recovery, the one-time recovery code, shown before the app. */
  const [issued, setIssued] = useState<{ token: string; code: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);

  const switchMode = (next: Mode) => {
    setMode(next);
    setError(null);
    setPassword('');
    setConfirm('');
    setCode('');
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    // Only signup and recovery carry a second field to confirm against.
    if (mode !== 'signin' && password !== confirm) {
      setError('The two passwords do not match');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (mode === 'signup') {
        const res = await api<SignInResponse>('/auth/signup', { body: { email, name: name.trim() || undefined, password } });
        setIssued({ token: res.token, code: res.recoveryCode ?? '' });
      } else if (mode === 'recover') {
        const res = await api<SignInResponse>('/auth/recover', { body: { email, code, password } });
        setIssued({ token: res.token, code: res.recoveryCode ?? '' });
      } else {
        onSignedIn((await api<SignInResponse>('/auth/signin', { body: { email, password } })).token);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed');
    } finally {
      setBusy(false);
    }
  };

  if (issued) {
    return (
      <div className="signin">
        <Brand />
        <h1>Save your recovery code</h1>
        <div className="card signin-card">
          <p className="muted">
            It is the only way back into your account if you forget your password — there is no email server to send you a reset link.
          </p>
          <p className="recovery-code">{issued.code}</p>
          <button
            className="btn"
            type="button"
            onClick={() => {
              navigator.clipboard
                .writeText(issued.code)
                .then(() => setCopied(true))
                .catch(() => {});
            }}
          >
            {copied ? 'Copied' : 'Copy code'}
          </button>
          <label className="field check">
            <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} /> I have saved it somewhere safe
          </label>
          <button className="btn primary block" type="button" disabled={!saved} onClick={() => onSignedIn(issued.token)}>
            Continue
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="signin">
      <Brand />
      <h1>{HEADINGS[mode]}</h1>
      <form className="card signin-card" onSubmit={submit}>
        <label className="field">
          Email
          <input type="email" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com" />
        </label>
        {mode === 'signup' && (
          <label className="field">
            Display name <span className="muted">(optional)</span>
            <input type="text" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} placeholder="How others see you" />
          </label>
        )}
        {mode === 'recover' && (
          <label className="field">
            Recovery code
            <input type="text" required value={code} onChange={(e) => setCode(e.target.value)} placeholder="xxxxx-xxxxx-xxxxx-xxxxx" autoComplete="off" />
          </label>
        )}
        <label className="field">
          {mode === 'recover' ? 'New password' : 'Password'}
          <input
            type="password"
            required
            minLength={mode === 'signin' ? undefined : 8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={mode === 'signin' ? 'Your password' : 'At least 8 characters'}
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
          />
        </label>
        {mode !== 'signin' && (
          <label className="field">
            Repeat password
            <input type="password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="The same password again" autoComplete="new-password" />
          </label>
        )}
        <button className="btn primary block" type="submit" disabled={busy}>
          {busy ? 'Working…' : mode === 'signin' ? 'Sign in' : mode === 'signup' ? 'Create account' : 'Set new password'}
        </button>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <p className="muted small signin-links">
          {mode === 'signin' ? (
            <>
              New here?{' '}
              <a href="#" onClick={(e) => { e.preventDefault(); switchMode('signup'); }}>
                Create an account
              </a>{' '}
              ·{' '}
              <a href="#" onClick={(e) => { e.preventDefault(); switchMode('recover'); }}>
                Forgot password?
              </a>
            </>
          ) : (
            <a href="#" onClick={(e) => { e.preventDefault(); switchMode('signin'); }}>
              Back to sign in
            </a>
          )}
        </p>
      </form>
      <p className="muted small">
        {mode === 'signup' ? 'You will get a one-time recovery code right after signing up.' : 'Passwords protect your account. Never share your recovery code.'}
      </p>
    </div>
  );
}

function Brand() {
  return (
    <div className="brand">
      <svg width="36" height="36" viewBox="0 0 36 36" aria-hidden="true">
        <rect width="36" height="36" rx="9" fill="var(--accent)" />
        <path d="M10 13h11a5 5 0 0 1 0 10h-3l-5 4v-4h-3z" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinejoin="round" />
      </svg>
      <span>Relay</span>
    </div>
  );
}
