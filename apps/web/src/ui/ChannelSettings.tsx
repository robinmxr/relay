import { useEffect, useState, type FormEvent } from 'react';
import type { Channel, User, UserWithPresence } from '@relay/shared';
import { api } from '../api';
import { Avatar } from './Avatar';
import { Flash } from './Flash';
import { Page } from './Page';

/**
 * Rename, topic, membership, archive and leave for one channel.
 * DMs have no settings; public channels manage leaving, private ones also membership.
 */
export function ChannelSettings({
  channel,
  me,
  users,
  onBack,
  onLeft,
}: {
  channel: Channel;
  me: User;
  users: Record<string, UserWithPresence>;
  onBack: () => void;
  onLeft: (channelId: string) => void;
}) {
  const archived = channel.archivedAt !== null;
  const [name, setName] = useState(channel.name);
  const [topic, setTopic] = useState(channel.topic);
  const [members, setMembers] = useState<UserWithPresence[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [confirm, setConfirm] = useState<null | 'archive' | 'unarchive' | 'leave'>(null);
  const [adding, setAdding] = useState(false);

  const loadMembers = async () => {
    try {
      setMembers(await api<UserWithPresence[]>(`/channels/${channel.id}/members`));
    } catch {
      setError('Could not load the member list');
    }
  };
  useEffect(() => void loadMembers(), []); // eslint-disable-line react-hooks/exhaustive-deps

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

  const save = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      await api(`/channels/${channel.id}`, { method: 'PATCH', body: { name: name.trim(), topic: topic.trim() } });
      setSaved(true);
    }, 'Could not save the channel');
  };

  const invitable = Object.values(users).filter((u) => u.id !== me.id && !members?.some((m) => m.id === u.id));

  return (
    <Page
      label="Channel settings"
      title={`#${channel.name}`}
      subtitle={channel.isPrivate ? 'Private channel' : 'Public channel'}
      onBack={onBack}
    >
      {archived && (
        <p className="hint">This channel is archived. It stays readable, but nobody can post until it is restored.</p>
      )}

      <section>
        <h3>Name and topic</h3>
        <form className="settings-form" onSubmit={save}>
          <label className="field">
            Name
            <input className="input" required maxLength={80} value={name} onChange={(e) => { setName(e.target.value); setSaved(false); }} />
          </label>
          <label className="field">
            Topic
            <input className="input" maxLength={200} placeholder="What is this channel about?" value={topic} onChange={(e) => { setTopic(e.target.value); setSaved(false); }} />
          </label>
          <button className="btn small primary" type="submit" disabled={busy}>
            Save
          </button>
          <Flash key={String(saved)} visible={saved}>
            <span className="flash ok">Saved. Everyone sees it right away.</span>
          </Flash>
        </form>
      </section>

      <section>
        <h3>Members{members ? ` (${members.length})` : ''}</h3>
        {members === null ? (
          <p className="hint">Loading…</p>
        ) : (
          <>
            {members.map((m) => (
              <div key={m.id} className="session-row">
                <div className="member-id">
                  <Avatar user={m} size={26} online={m.online} />
                  <span>{m.id === me.id ? `${m.name} (you)` : m.name}</span>
                </div>
                {channel.isPrivate && m.id !== me.id && (
                  <button className="btn small" disabled={busy} onClick={() => void run(() => api(`/channels/${channel.id}/members/${m.id}`, { method: 'DELETE' }), 'Could not remove them', loadMembers)}>
                    Remove
                  </button>
                )}
              </div>
            ))}
            {channel.isPrivate && (
              adding ? (
                invitable.length ? (
                  <ul className="nav-list picker add-list">
                    {invitable.map((u) => (
                      <li key={u.id}>
                        <button className="nav-item" disabled={busy} onClick={() => void run(() => api(`/channels/${channel.id}/members`, { body: { userId: u.id } }), 'Could not add them', loadMembers)}>
                          <Avatar user={u} size={20} online={u.online} />
                          <span className="nav-label">{u.name}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="hint">Everyone in the workspace is already here.</p>
                )
              ) : (
                <button className="btn small" onClick={() => setAdding(true)}>
                  Add people
                </button>
              )
            )}
          </>
        )}
      </section>

      <section className="danger">
        <h3>{channel.isPrivate ? 'Danger zone' : 'Leave or archive'}</h3>
        {confirm === 'archive' || confirm === 'unarchive' ? (
          <div className="settings-row">
            <span>{confirm === 'archive' ? 'Archive this channel? No one can post afterwards.' : 'Restore this channel?'}</span>
            <button className="btn small primary" disabled={busy} onClick={() => void run(() => api(`/channels/${channel.id}/archive`, { body: { archived: confirm === 'archive' } }), 'Could not archive', onBack)}>
              {confirm === 'archive' ? 'Archive' : 'Restore'}
            </button>
          </div>
        ) : (
          <button className="btn small" disabled={busy} onClick={() => setConfirm(archived ? 'unarchive' : 'archive')}>
            {archived ? 'Restore channel' : 'Archive channel'}
          </button>
        )}
        {confirm === 'leave' ? (
          <div className="settings-row">
            <span>Leave #{channel.name}? You can rejoin{channel.isPrivate ? ' only if someone adds you back' : ''}.</span>
            <button className="btn small danger-btn" disabled={busy} onClick={() => void run(() => api(`/channels/${channel.id}/members/me`, { method: 'DELETE' }), 'Could not leave', () => onLeft(channel.id))}>
              Leave
            </button>
          </div>
        ) : (
          <button className="btn small danger-btn" disabled={busy} onClick={() => setConfirm('leave')}>
            Leave channel
          </button>
        )}
      </section>

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </Page>
  );
}
