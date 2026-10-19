import { useLayoutEffect, useRef } from 'react';
import type { Channel, FileInfo, Message, User } from '@relay/shared';
import { channelTitle } from '../format';
import { Composer } from './Composer';
import { CloseIcon } from './icons';
import { MessageItem } from './MessageItem';
import type { MessageActions } from './MessageList';

interface Props extends MessageActions {
  channel: Channel;
  me: User;
  users: Record<string, User>;
  parent: Message | undefined;
  replies: Message[] | undefined;
  onClose: () => void;
  onSend: (body: string, fileIds: string[]) => Promise<void>;
  onUpload: (file: File) => Promise<FileInfo>;
}

export function Thread({ channel, me, users, parent, replies, onClose, onSend, onUpload, onReact, onEdit, onDelete }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [replies]);

  const count = replies?.length ?? parent?.replyCount ?? 0;
  const actions = { canAct: channel.isMember, onReact, onEdit, onDelete };

  return (
    <aside className="thread" aria-label="Thread">
      <header className="pane-head">
        <div className="pane-title">
          <h2>Thread</h2>
          <p>{channelTitle(channel, me)}</p>
        </div>
        <button className="icon-btn" aria-label="Close thread" onClick={onClose}>
          <CloseIcon size={18} />
        </button>
      </header>
      <div className="messages" ref={ref}>
        {parent ? <MessageItem message={parent} me={me} users={users} {...actions} /> : <p className="muted pad">Loading…</p>}
        <div className="day-divider left">
          <span>
            {count} {count === 1 ? 'reply' : 'replies'}
          </span>
        </div>
        {replies?.map((r) => <MessageItem key={r.id} message={r} me={me} users={users} {...actions} />)}
      </div>
      {channel.isMember && !parent?.deleted && (
        <Composer placeholder="Reply…" users={users} onSend={onSend} onUpload={onUpload} focusKey={parent?.id} />
      )}
    </aside>
  );
}
