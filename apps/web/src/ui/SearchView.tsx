import type { Channel, Message, User } from '@relay/shared';
import { channelTitle, formatDateTime, renderBody } from '../format';
import { Avatar } from './Avatar';
import { BackIcon, CloseIcon } from './icons';

interface Props {
  query: string;
  results: Message[] | null;
  error: string | null;
  channels: Channel[];
  me: User;
  users: Record<string, User>;
  onOpen: (message: Message) => void;
  onClose: () => void;
}

export function SearchView({ query, results, error, channels, me, users, onOpen, onClose }: Props) {
  const byId = new Map(channels.map((c) => [c.id, c]));
  return (
    <section className="channel" aria-label="Search results">
      <header className="pane-head">
        <button className="icon-btn mobile-only" aria-label="Back" onClick={onClose}>
          <BackIcon size={18} />
        </button>
        <div className="pane-title">
          <h1>Search</h1>
          <p>Results for “{query}” in channels you belong to</p>
        </div>
        <button className="icon-btn" aria-label="Close search" onClick={onClose}>
          <CloseIcon size={18} />
        </button>
      </header>
      <div className="messages">
        {error && (
          <p className="form-error pad" role="alert">
            {error}
          </p>
        )}
        {!error && !results && <p className="muted pad">Searching…</p>}
        {results?.length === 0 && <p className="muted pad">No messages match.</p>}
        <ul className="search-results">
          {results?.map((m) => {
            const channel = byId.get(m.channelId);
            return (
              <li key={m.id}>
                <button className="search-hit" onClick={() => onOpen(m)}>
                  <Avatar user={m.user} size={32} />
                  <span className="search-hit-main">
                    <span className="search-hit-head">
                      <strong>{m.user.name}</strong>
                      <span className="muted small">
                        {channel ? channelTitle(channel, me) : 'Unknown channel'}
                        {m.parentId ? ' · in a thread' : ''} · {formatDateTime(m.createdAt)}
                      </span>
                    </span>
                    <span className="search-hit-body">{renderBody(m.body, users, me.id)}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
