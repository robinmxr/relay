import { useState } from 'react';
import type { UserWithPresence, Workspace } from '@relay/shared';
import { formatTime } from '../format';
import { Avatar } from './Avatar';
import { CopyIcon, MailIcon, MessageIcon, PencilIcon } from './icons';
import { Page } from './Page';

/** Someone's profile: who they are, whether they're around, and the way to message them. */
export function Profile({
  user,
  meId,
  workspace,
  backLabel,
  onMessage,
  onEditOwn,
  onBack,
}: {
  /** Null when they are not (or no longer) in this workspace. */
  user: UserWithPresence | null;
  meId: string;
  workspace: Workspace | null;
  backLabel?: string;
  onMessage: (userId: string) => void;
  onEditOwn: () => void;
  onBack: () => void;
}) {
  const [copied, setCopied] = useState(false);

  if (!user) {
    return (
      <Page title="Profile" backLabel={backLabel} onBack={onBack}>
        <section>
          <h3>Not found</h3>
          <p className="hint">This person is not a member of {workspace?.name ?? 'this workspace'}.</p>
        </section>
      </Page>
    );
  }

  const self = user.id === meId;
  const status = user.status && (!user.status.expiresAt || new Date(user.status.expiresAt) > new Date()) ? user.status : null;

  const copyEmail = () => {
    navigator.clipboard
      .writeText(user.email)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => {});
  };

  return (
    <Page title="Profile" subtitle={workspace?.name} label={`${user.name}'s profile`} backLabel={backLabel} onBack={onBack}>
      <section className="profile-card">
        <div className="profile-hero">
          <Avatar user={user} size={96} online={user.online} />
          <div className="profile-id">
            <h2>
              {user.name}
              {self && <span className="pill">you</span>}
              {user.role === 'owner' && <span className="pill">owner</span>}
            </h2>
            <p className={`profile-presence ${user.online ? 'on' : 'off'}`}>
              <span className="presence-dot" aria-hidden="true" />
              {user.online ? 'Active now' : 'Away'}
            </p>
            {status && (
              <p className="profile-status">
                <span aria-hidden="true">{status.emoji}</span> {status.text || 'Status set'}
                {status.expiresAt && <span className="hint"> · until {formatTime(status.expiresAt)}</span>}
              </p>
            )}
          </div>
        </div>
        <div className="profile-actions">
          {self ? (
            <button className="btn primary" onClick={onEditOwn}>
              <PencilIcon size={16} />
              Edit profile
            </button>
          ) : (
            <button className="btn primary" onClick={() => onMessage(user.id)}>
              <MessageIcon size={16} />
              Message
            </button>
          )}
          <button className="btn" onClick={copyEmail}>
            <CopyIcon size={16} />
            {copied ? 'Copied' : 'Copy email'}
          </button>
        </div>
      </section>

      <section>
        <h3>Contact</h3>
        <dl className="profile-facts">
          <div>
            <dt>Email</dt>
            <dd>
              <a href={`mailto:${user.email}`}>
                <MailIcon size={14} />
                {user.email}
              </a>
            </dd>
          </div>
          <div>
            <dt>Role</dt>
            <dd>{user.role === 'owner' ? `Owner of ${workspace?.name ?? 'this workspace'}` : 'Member'}</dd>
          </div>
        </dl>
      </section>
    </Page>
  );
}
