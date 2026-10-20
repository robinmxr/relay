import { useState } from 'react';
import type { Message, User } from '@relay/shared';
import { formatBytes, formatTime, renderBody, toEditable, toWire } from '../format';
import { Avatar } from './Avatar';
import { FileIcon, PencilIcon, ThreadIcon, TrashIcon } from './icons';

const QUICK_REACTIONS = ['👍', '❤️', '😂', '🎉', '👀'];

interface Props {
  message: Message;
  me: User;
  users: Record<string, User>;
  compact?: boolean;
  highlighted?: boolean;
  /** Members can react, edit and delete; others only read. */
  canAct: boolean;
  onReact?: (messageId: string, emoji: string) => Promise<void>;
  /** Omitted inside a thread, where replies cannot have replies. */
  onOpenThread?: (messageId: string) => void;
  onEdit?: (messageId: string, body: string) => Promise<void>;
  onDelete?: (messageId: string) => Promise<void>;
  /** Opens a person: their DM with you, or your own settings when it's you. */
  onOpenUser?: (userId: string) => void;
}

export function MessageItem({ message: m, me, users, compact, highlighted, canAct, onReact, onOpenThread, onEdit, onDelete, onOpenUser }: Props) {
  const [editing, setEditing] = useState(false);
  const mine = m.user.id === me.id;
  const mentionsMe = m.mentions.includes(me.id);
  const react = (emoji: string) => void onReact?.(m.id, emoji).catch(console.error);
  const openUser = () => onOpenUser?.(m.user.id);
  const userTitle = mine ? 'Your profile' : `Message ${m.user.name}`;

  const remove = () => {
    if (window.confirm('Delete this message? This cannot be undone.')) void onDelete?.(m.id).catch((err) => window.alert(err.message));
  };

  return (
    <article
      className={`msg${compact ? ' compact' : ''}${highlighted ? ' highlighted' : ''}${mentionsMe ? ' mentions-me' : ''}`}
      aria-label={`${m.user.name}, ${formatTime(m.createdAt)}`}
    >
      <div className="msg-gutter">
        {compact ? (
          <time className="msg-side-time" dateTime={m.createdAt}>
            {formatTime(m.createdAt)}
          </time>
        ) : onOpenUser ? (
          <button className="avatar-btn" onClick={openUser} title={userTitle} aria-label={userTitle}>
            <Avatar user={m.user} size={36} />
          </button>
        ) : (
          <Avatar user={m.user} size={36} />
        )}
      </div>
      <div className="msg-main">
        {!compact && (
          <div className="msg-head">
            {onOpenUser ? (
              <button className="msg-author as-btn" onClick={openUser} title={userTitle}>
                {mine ? `${m.user.name} (you)` : m.user.name}
              </button>
            ) : (
              <span className="msg-author">{mine ? `${m.user.name} (you)` : m.user.name}</span>
            )}
            <time dateTime={m.createdAt}>{formatTime(m.createdAt)}</time>
          </div>
        )}

        {m.deleted ? (
          <p className="msg-body deleted">This message was deleted.</p>
        ) : editing && onEdit ? (
          <EditBox
            initial={m.body}
            users={users}
            onCancel={() => setEditing(false)}
            onSave={async (body) => {
              await onEdit(m.id, body);
              setEditing(false);
            }}
          />
        ) : (
          m.body && (
            <div className="msg-body">
              {renderBody(m.body, users, me.id, onOpenUser)}
              {m.editedAt && <span className="edited muted"> (edited)</span>}
            </div>
          )
        )}

        {m.files.length > 0 && (
          <div className="files">
            {m.files.map((f) =>
              f.isImage ? (
                <a key={f.id} className="file-image" href={f.url} target="_blank" rel="noopener noreferrer">
                  <img src={f.url} alt={f.name} loading="lazy" />
                </a>
              ) : (
                <a key={f.id} className="file-chip" href={f.url} download={f.name}>
                  <FileIcon size={18} />
                  <span className="file-name">{f.name}</span>
                  <span className="muted small">{formatBytes(f.size)}</span>
                </a>
              ),
            )}
          </div>
        )}

        {m.reactions.length > 0 && (
          <div className="reactions">
            {m.reactions.map((r) => {
              const reacted = r.userIds.includes(me.id);
              const names = r.userIds.map((id) => (id === me.id ? 'you' : (users[id]?.name ?? 'someone'))).join(', ');
              return (
                <button
                  key={r.emoji}
                  className={`reaction${reacted ? ' mine' : ''}`}
                  aria-pressed={reacted}
                  title={names}
                  aria-label={`${r.emoji} ${r.userIds.length}: ${names}`}
                  disabled={!canAct}
                  onClick={() => react(r.emoji)}
                >
                  <span aria-hidden="true">{r.emoji}</span> {r.userIds.length}
                </button>
              );
            })}
          </div>
        )}

        {onOpenThread && m.replyCount > 0 && (
          <button className="replies-link" onClick={() => onOpenThread(m.id)}>
            <ThreadIcon size={14} />
            {m.replyCount} {m.replyCount === 1 ? 'reply' : 'replies'}
            {m.lastReplyAt && <span className="muted">Last reply {formatTime(m.lastReplyAt)}</span>}
          </button>
        )}
      </div>

      {canAct && !m.deleted && !editing && (
        <div className="msg-actions" role="toolbar" aria-label="Message actions">
          {onReact &&
            QUICK_REACTIONS.map((e) => (
              <button key={e} onClick={() => react(e)} aria-label={`React with ${e}`}>
                {e}
              </button>
            ))}
          {onOpenThread && (
            <button onClick={() => onOpenThread(m.id)} aria-label="Reply in thread" title="Reply in thread">
              <ThreadIcon size={15} />
            </button>
          )}
          {mine && onEdit && (
            <button onClick={() => setEditing(true)} aria-label="Edit message" title="Edit">
              <PencilIcon size={15} />
            </button>
          )}
          {mine && onDelete && (
            <button onClick={remove} aria-label="Delete message" title="Delete">
              <TrashIcon size={15} />
            </button>
          )}
        </div>
      )}
    </article>
  );
}

function EditBox(props: { initial: string; users: Record<string, User>; onSave: (body: string) => Promise<void>; onCancel: () => void }) {
  const [{ text: start, mentions }] = useState(() => toEditable(props.initial, props.users));
  const [text, setText] = useState(start);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await props.onSave(toWire(text.trim(), mentions));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save');
      setBusy(false);
    }
  };

  return (
    <div className="edit-box">
      <label className="sr-only" htmlFor="edit-message">
        Edit message
      </label>
      <textarea
        id="edit-message"
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') props.onCancel();
          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            void save();
          }
        }}
      />
      <div className="edit-actions">
        <button className="btn small" onClick={props.onCancel}>
          Cancel
        </button>
        <button className="btn small primary" onClick={() => void save()} disabled={busy}>
          Save
        </button>
        {error && (
          <span className="form-error" role="alert">
            {error}
          </span>
        )}
      </div>
    </div>
  );
}
