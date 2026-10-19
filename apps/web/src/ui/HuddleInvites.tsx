import { useEffect } from 'react';
import type { User } from '@relay/shared';
import { Avatar } from './Avatar';
import { HeadphonesIcon } from './icons';

export interface HuddleInvite {
  channelId: string;
  workspaceId: string;
  /** "#channel", or the starter's name for a DM. */
  title: string;
  isDm: boolean;
  by: User;
}

const AUTO_DISMISS_MS = 45_000;

/** Pop-ups for huddles someone else started in a channel you belong to. */
export function HuddleInvites(props: { invites: HuddleInvite[]; onJoin: (invite: HuddleInvite) => void; onDismiss: (channelId: string) => void }) {
  return (
    <div className="invites" aria-live="assertive">
      {props.invites.map((invite) => (
        <InviteCard key={invite.channelId} invite={invite} onJoin={props.onJoin} onDismiss={props.onDismiss} />
      ))}
    </div>
  );
}

function InviteCard({ invite, onJoin, onDismiss }: { invite: HuddleInvite; onJoin: (i: HuddleInvite) => void; onDismiss: (channelId: string) => void }) {
  useEffect(() => {
    const timer = window.setTimeout(() => onDismiss(invite.channelId), AUTO_DISMISS_MS);
    return () => window.clearTimeout(timer);
  }, [invite.channelId, onDismiss]);

  const headingId = `invite-${invite.channelId}`;
  return (
    <section className="invite-card" aria-labelledby={headingId}>
      <div className="invite-who">
        <Avatar user={invite.by} size={40} />
        <div>
          <p id={headingId} className="invite-title">
            <strong>{invite.by.name}</strong> {invite.isDm ? 'is calling you' : 'started a huddle'}
          </p>
          {!invite.isDm && <p className="muted small">in {invite.title}</p>}
        </div>
      </div>
      <div className="invite-actions">
        <button className="btn" onClick={() => onDismiss(invite.channelId)}>
          Not now
        </button>
        <button className="btn primary" onClick={() => onJoin(invite)} autoFocus>
          <HeadphonesIcon size={16} /> Join
        </button>
      </div>
    </section>
  );
}
