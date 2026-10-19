import { useState, type FormEvent } from 'react';
import type { SignInResponse, User } from '@relay/shared';
import { api } from '../api';

export function SignIn({ onSignedIn }: { onSignedIn: (token: string, me: User) => void }) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api<SignInResponse>('/auth/signin', { body: { email, name: name.trim() || undefined } });
      onSignedIn(res.token, res.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed');
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
      <h1>Sign in to your workspace</h1>
      <form className="card signin-card" onSubmit={submit}>
        <label className="field">
          Work email
          <input type="email" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com" />
        </label>
        <label className="field">
          Display name <span className="muted">(optional)</span>
          <input type="text" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} placeholder="How others see you" />
        </label>
        <button className="btn primary block" type="submit" disabled={busy}>
          {busy ? 'Signing in…' : 'Continue'}
        </button>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
      </form>
      <p className="muted small">Development sign-in: there is no password, so anyone who knows an email can use it.</p>
    </div>
  );
}
