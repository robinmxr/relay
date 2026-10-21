import { Fragment, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import type { Channel, Message, User } from '@relay/shared';
import { dayKey, dayLabel } from '../format';
import { MessageItem } from './MessageItem';

export interface MessageActions {
  onReact: (messageId: string, emoji: string) => Promise<void>;
  onEdit: (messageId: string, body: string) => Promise<void>;
  onDelete: (messageId: string) => Promise<void>;
}

interface Props extends MessageActions {
  channel: Channel;
  me: User;
  users: Record<string, User>;
  messages: Message[] | undefined;
  hasMore: boolean;
  activeThreadId: string | null;
  /** Shown above the first message, once there are no earlier ones to load. */
  intro: ReactNode;
  onOpenThread: (messageId: string) => void;
  onLoadOlder: () => Promise<void>;
  /** Opens a person's profile. */
  onOpenUser?: (userId: string) => void;
}

const GROUP_WINDOW_MS = 5 * 60_000;

export function MessageList(p: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  const [loadingOlder, setLoadingOlder] = useState(false);

  const onScroll = () => {
    const el = ref.current;
    if (el) stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };

  // Follow new messages only when already at the bottom.
  useLayoutEffect(() => {
    const el = ref.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [p.messages]);

  const loadOlder = async () => {
    const el = ref.current;
    const fromBottom = el ? el.scrollHeight - el.scrollTop : 0;
    setLoadingOlder(true);
    try {
      await p.onLoadOlder();
    } finally {
      setLoadingOlder(false);
      // Keep the same message under the reader after prepending.
      requestAnimationFrame(() => {
        if (el) el.scrollTop = el.scrollHeight - fromBottom;
      });
    }
  };

  return (
    <div className="messages" ref={ref} onScroll={onScroll} role="log" aria-label="Messages">
      {!p.messages && <p className="muted pad">Loading messages…</p>}
      {p.messages && (
        <>
          {p.hasMore ? (
            <div className="load-older">
              <button className="btn small" onClick={() => void loadOlder()} disabled={loadingOlder}>
                {loadingOlder ? 'Loading…' : 'Load earlier messages'}
              </button>
            </div>
          ) : (
            p.intro
          )}
          {p.messages.map((m, i) => {
            const prev = p.messages![i - 1];
            const newDay = !prev || dayKey(prev.createdAt) !== dayKey(m.createdAt);
            const compact =
              !newDay &&
              !prev.deleted &&
              prev.user.id === m.user.id &&
              Date.parse(m.createdAt) - Date.parse(prev.createdAt) < GROUP_WINDOW_MS;
            return (
              <Fragment key={m.id}>
                {newDay && (
                  <div className="day-divider">
                    <span>{dayLabel(m.createdAt)}</span>
                  </div>
                )}
                <MessageItem
                  message={m}
                  me={p.me}
                  users={p.users}
                  compact={compact}
                  highlighted={m.id === p.activeThreadId}
                  canAct={p.channel.isMember}
                  onReact={p.onReact}
                  onOpenThread={p.onOpenThread}
                  onEdit={p.onEdit}
                  onDelete={p.onDelete}
                  onOpenUser={p.onOpenUser}
                />
              </Fragment>
            );
          })}
        </>
      )}
    </div>
  );
}
