import { useState } from 'react';
import type { UserWithPresence, Workspace } from '@relay/shared';
import { api } from '../api';
import { Avatar } from './Avatar';
import { Flash } from './Flash';
import { Page } from './Page';

/** The workspace's people: who is here, searchable — and — for the owner — rename, remove and password reset. */
export function People({
  workspace,
  members,
  onMessage,
  onBack,
}: {
  workspace: Workspace | null;
  members: UserWithPresence[];
  /** Opens a DM with the person; for yourself it opens your settings. */
  onMessage: (userId: string) => void;
  onBack: () => void;
}) {
  const isOwner = workspace?.role === 'owner';
  const [name, setName] = useState(workspace?.name ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [reset, setReset] = useState<{ email: string; tempPassword: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [filter, setFilter] = useState('');

  const run = async (fn: () => Promise<unknown>, fail: string, after?: () => void) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      after?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : fail);
    } finally {
      setBusy(false);
    }
  };

  const rename = (e: React.FormEvent) => {
    e.preventDefault();
    if (!workspace) return;
    void run(async () => {
      await api(`/workspaces/${workspace.id}`, { method: 'PATCH', body: { name: name.trim() } });
      setSaved(true);
    }, 'Could not rename the workspace');
  };

  const doReset = (u: UserWithPresence) => {
    if (!workspace) return;
    void run(
      async () => {
        const res = await api<{ tempPassword: string }>(`/workspaces/${workspace.id}/members/${u.id}/reset-password`, { method: 'POST' });
        setReset({ email: u.email, tempPassword: res.tempPassword });
        setCopied(false);
      },
      'Could not reset the password',
    );
  };

  const q = filter.trim().toLowerCase();
  const visible = members.filter((u) => !q || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q));

  return (
    <Page label="People" title="People" subtitle={workspace?.name ?? 'Relay'} onBack={onBack}>
      {reset && (
        <section className="danger">
          <h3>One-time password for {reset.email}</h3>
          <p className="hint">
            Give this to them now — it shows only once. They must replace it at sign-in, and all their sessions are signed out.
          </p>
          <p className="recovery-code">{reset.tempPassword}</p>
          <div className="settings-row">
            <button
              className="btn small"
              onClick={() => {
                navigator.clipboard.writeText(reset.tempPassword).then(() => setCopied(true)).catch(() => {});
              }}
            >
              {copied ? 'Copied' : 'Copy password'}
            </button>
            <button className="btn small" onClick={() => setReset(null)}>
              Done
            </button>
          </div>
        </section>
      )}

      {isOwner && (
        <section>
          <h3>Workspace name</h3>
          <form className="settings-row" onSubmit={rename}>
            <input className="input" required maxLength={80} value={name} onChange={(e) => { setName(e.target.value); setSaved(false); }} />
            <button className="btn small primary" type="submit" disabled={busy || !name.trim() || name === workspace?.name}>
              Save
            </button>
            <Flash key={String(saved)} visible={saved}>
              <span className="flash ok">Saved</span>
            </Flash>
          </form>
        </section>
      )}

      <section>
        <h3>Members ({members.length})</h3>
        <input
          className="input member-search"
          type="search"
          placeholder="Find people by name or email"
          aria-label="Find people"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          maxLength={100}
        />
        {visible.map((u) => (
          <div key={u.id} className="session-row">
            <div className="member-id">
              <Avatar user={u} size={28} online={u.online} />
              <div>
                <div>
                  {u.name}
                  {u.status ? ` ${u.status.emoji}` : ''}
                  {u.role === 'owner' && <span className="pill">owner</span>}
                </div>
                <div className="session-meta">{u.email}</div>
              </div>
            </div>
            <div className="row-actions">
              <button className="btn small" onClick={() => onMessage(u.id)}>
                Message
              </button>
              {isOwner && u.role !== 'owner' &&
                (confirmRemove === u.id ? (
                  <button className="btn small danger-btn" disabled={busy} onClick={() => void run(() => api(`/workspaces/${workspace!.id}/members/${u.id}`, { method: 'DELETE' }), 'Could not remove them', () => setConfirmRemove(null))}>
                    Really remove?
                  </button>
                ) : (
                  <>
                    <button className="btn small" disabled={busy} onClick={() => doReset(u)}>
                      Reset password
                    </button>
                    <button className="btn small danger-btn" onClick={() => setConfirmRemove(u.id)}>
                      Remove
                    </button>
                  </>
                ))}
            </div>
          </div>
        ))}
        {members.length > 0 && visible.length === 0 && <p className="hint">No one matches.</p>}
      </section>

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </Page>
  );
}
