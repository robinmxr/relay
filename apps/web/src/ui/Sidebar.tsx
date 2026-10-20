import { useState, type FormEvent, type ReactNode } from 'react';
import type { Channel, User, UserWithPresence, Workspace } from '@relay/shared';
import type { ConnectionStatus } from '../api';
import { canRequestBrowserNotifications } from '../desktop';
import { Avatar } from './Avatar';
import { GearIcon, HashIcon, HeadphonesIcon, InviteIcon, LockIcon, PlusIcon, SearchIcon, SignOutIcon, UsersIcon } from './icons';

interface Props {
  me: User;
  workspace: Workspace | null;
  status: ConnectionStatus;
  channels: Channel[];
  users: Record<string, UserWithPresence>;
  activeId: string | null;
  onOpen: (id: string) => void;
  onCreateChannel: (name: string, isPrivate: boolean) => Promise<void>;
  onJoin: (id: string) => Promise<void>;
  onStartDm: (userId: string) => Promise<void>;
  onSearch: (query: string) => void;
  onOpenSettings: () => void;
  onOpenPeople: () => void;
  onSignOut: () => void;
  /** Huddle controls, when this client is in a huddle. */
  footer?: ReactNode;
}

const STATUS_LABEL: Record<ConnectionStatus, string> = {
  connecting: 'Connecting…',
  online: 'Connected',
  offline: 'Reconnecting…',
  unauthorized: 'Signed out',
};

export function Sidebar(p: Props) {
  const [panel, setPanel] = useState<null | 'new' | 'browse' | 'dm' | 'invite'>(null);
  const [askNotify, setAskNotify] = useState(canRequestBrowserNotifications);
  const [query, setQuery] = useState('');
  const [dmQuery, setDmQuery] = useState('');
  const [copied, setCopied] = useState(false);
  const toggle = (name: NonNullable<typeof panel>) => {
    if (name === 'dm' && panel !== 'dm') setDmQuery('');
    setPanel((cur) => (cur === name ? null : name));
  };

  const mine = p.channels.filter((c) => !c.isDm && c.isMember);
  // Archived public channels drop out of browse; they stay visible where already joined.
  const others = p.channels.filter((c) => !c.isDm && !c.isMember && !c.archivedAt);
  const dms = p.channels.filter((c) => c.isDm);
  const dmQ = dmQuery.trim().toLowerCase();
  const dmCandidates = Object.values(p.users).filter(
    (u) => !dmQ || u.name.toLowerCase().includes(dmQ) || u.email.toLowerCase().includes(dmQ),
  );

  const search = (e: FormEvent) => {
    e.preventDefault();
    if (query.trim()) p.onSearch(query.trim());
  };

  const copyCode = async () => {
    if (!p.workspace) return;
    try {
      await navigator.clipboard.writeText(p.workspace.joinCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard blocked; the code is visible to copy by hand.
    }
  };

  return (
    <aside className="sidebar" aria-label="Channels and direct messages">
      <div className="sidebar-head">
        <div className="sidebar-head-text">
          <div className="ws-name">{p.workspace?.name ?? 'Relay'}</div>
          <button className="ws-status as-btn" title="Your profile and settings" onClick={p.onOpenSettings}>
            <span className={`status-dot ${p.status}`} aria-hidden="true" />
            {p.me.status ? `${p.me.status.emoji} ${p.me.status.text}`.trim() : p.me.name} · {STATUS_LABEL[p.status]}
          </button>
        </div>
      </div>

      <form className="sidebar-search" role="search" onSubmit={search}>
        <label className="sr-only" htmlFor="search-input">
          Search messages
        </label>
        <SearchIcon size={15} />
        <input id="search-input" type="search" placeholder={`Search ${p.workspace?.name ?? ''}`} value={query} onChange={(e) => setQuery(e.target.value)} maxLength={200} />
      </form>

      <nav className="sidebar-scroll">
        <SectionHeader title="Channels" actionLabel="Create a channel" onAction={() => toggle('new')} />
        {panel === 'new' && <NewChannelForm onCreate={async (n, priv) => (await p.onCreateChannel(n, priv), setPanel(null))} />}
        <ul className="nav-list">
          {mine.map((c) => (
            <li key={c.id}>
              <NavItem
                active={c.id === p.activeId}
                bold={c.unread > 0}
                count={c.mentions}
                huddle={c.huddle.length > 0}
                archived={c.archivedAt !== null}
                onClick={() => p.onOpen(c.id)}
                icon={c.isPrivate ? <LockIcon size={15} /> : <HashIcon size={15} />}
                label={c.archivedAt ? `${c.name} 📦` : c.name}
              />
            </li>
          ))}
        </ul>
        {others.length > 0 && (
          <button className="nav-link" onClick={() => toggle('browse')} aria-expanded={panel === 'browse'}>
            {panel === 'browse' ? 'Hide other channels' : `Browse ${others.length} more channel${others.length === 1 ? '' : 's'}`}
          </button>
        )}
        {panel === 'browse' && (
          <ul className="nav-list">
            {others.map((c) => (
              <li key={c.id} className="browse-row">
                <button className="browse-name" onClick={() => p.onOpen(c.id)}>
                  # {c.name}
                </button>
                <button className="btn small" onClick={() => void p.onJoin(c.id)}>
                  Join
                </button>
              </li>
            ))}
          </ul>
        )}

        <SectionHeader title="Direct messages" actionLabel="New direct message" onAction={() => toggle('dm')} />
        {panel === 'dm' && (
          <>
            <label className="sr-only" htmlFor="dm-filter">
              Find people
            </label>
            <input
              id="dm-filter"
              className="picker-filter"
              type="search"
              autoFocus
              placeholder="Find people"
              value={dmQuery}
              onChange={(e) => setDmQuery(e.target.value)}
              maxLength={100}
            />
            <ul className="nav-list picker" aria-label="People">
              {dmCandidates.map((u) => (
                <li key={u.id}>
                  <button className="nav-item" onClick={() => void p.onStartDm(u.id).then(() => setPanel(null))}>
                    <Avatar user={u} size={20} online={u.online} />
                    <span className="nav-label">
                      {u.id === p.me.id ? `${u.name} (you)` : u.name}
                      {u.status ? ` ${u.status.emoji}` : ''}
                    </span>
                  </button>
                </li>
              ))}
              {dmCandidates.length === 0 && <li className="picker-empty muted">No one matches.</li>}
            </ul>
          </>
        )}
        <ul className="nav-list">
          {dms.map((c) => {
            const other = c.dmUser ?? p.me;
            const otherUser = p.users[other.id];
            return (
              <li key={c.id}>
                <NavItem
                  active={c.id === p.activeId}
                  bold={c.unread > 0}
                  count={c.unread}
                  huddle={c.huddle.length > 0}
                  onClick={() => p.onOpen(c.id)}
                  icon={<Avatar user={other} size={20} online={otherUser?.online ?? false} />}
                  label={`${other.id === p.me.id ? `${other.name} (you)` : other.name}${otherUser?.status ? ` ${otherUser.status.emoji}` : ''}`}
                />
              </li>
            );
          })}
        </ul>
      </nav>

      {askNotify && (
        <button className="notify-prompt" onClick={() => void Notification.requestPermission().then(() => setAskNotify(canRequestBrowserNotifications()))}>
          Turn on desktop notifications
        </button>
      )}

      {p.footer}

      {panel === 'invite' && p.workspace && (
        <div className="invite-panel">
          <p>Share this invite code. People join from the + button in the workspace rail.</p>
          <div className="invite-code">
            <code>{p.workspace.joinCode}</code>
            <button className="btn small" onClick={() => void copyCode()}>
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
        </div>
      )}

      <div className="sidebar-foot">
        <button className="icon-btn on-dark" aria-label="Invite people" title="Invite people" aria-expanded={panel === 'invite'} onClick={() => toggle('invite')}>
          <InviteIcon />
        </button>
        <button className="icon-btn on-dark" aria-label="People" title="People" onClick={p.onOpenPeople}>
          <UsersIcon />
        </button>
        <button className="icon-btn on-dark" aria-label="Settings" title="Settings" onClick={p.onOpenSettings}>
          <GearIcon />
        </button>
        <button className="icon-btn on-dark" aria-label="Sign out" title="Sign out" onClick={p.onSignOut}>
          <SignOutIcon />
        </button>
      </div>
    </aside>
  );
}

function SectionHeader({ title, actionLabel, onAction }: { title: string; actionLabel: string; onAction: () => void }) {
  return (
    <div className="section-head">
      <h2>{title}</h2>
      <button className="icon-btn on-dark small" aria-label={actionLabel} title={actionLabel} onClick={onAction}>
        <PlusIcon size={14} />
      </button>
    </div>
  );
}

function NavItem(props: { active: boolean; bold: boolean; count: number; huddle: boolean; archived?: boolean; onClick: () => void; icon: ReactNode; label: string }) {
  const { active, bold, count } = props;
  return (
    <button
      className={`nav-item${active ? ' active' : ''}${bold && !active ? ' unread' : ''}${props.archived ? ' archived' : ''}`}
      aria-current={active ? 'page' : undefined}
      onClick={props.onClick}
    >
      {props.icon}
      <span className="nav-label">{props.label}</span>
      {props.huddle && (
        <span className="nav-huddle" title="Huddle in progress" aria-label="Huddle in progress">
          <HeadphonesIcon size={13} />
        </span>
      )}
      {count > 0 && !active && (
        <span className="badge" aria-label={`${count} unread`}>
          {count}
        </span>
      )}
    </button>
  );
}

function NewChannelForm({ onCreate }: { onCreate: (name: string, isPrivate: boolean) => Promise<void> }) {
  const [name, setName] = useState('');
  const [isPrivate, setPrivate] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await onCreate(name.trim().toLowerCase().replace(/\s+/g, '-'), isPrivate);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the channel');
    }
  };

  return (
    <form className="new-channel" onSubmit={submit}>
      <label className="sr-only" htmlFor="new-channel-name">
        Channel name
      </label>
      <input id="new-channel-name" autoFocus required maxLength={80} placeholder="e.g. launch-plans" value={name} onChange={(e) => setName(e.target.value)} />
      <label className="checkbox">
        <input type="checkbox" checked={isPrivate} onChange={(e) => setPrivate(e.target.checked)} />
        Private
      </label>
      <button className="btn small primary" type="submit">
        Create
      </button>
      {error && (
        <p className="form-error on-dark" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
