import type { Channel, FileInfo, Message, User } from '@relay/shared';
import { channelTitle } from '../format';
import { Composer } from './Composer';
import { BackIcon, HeadphonesIcon } from './icons';
import { MessageList, type MessageActions } from './MessageList';

interface Props extends MessageActions {
  channel: Channel;
  me: User;
  users: Record<string, User>;
  messages: Message[] | undefined;
  hasMore: boolean;
  typingNames: string[];
  activeThreadId: string | null;
  /** The channel whose huddle this client is in, if any. */
  myHuddleChannelId: string | null;
  onSend: (body: string, fileIds: string[]) => Promise<void>;
  onUpload: (file: File) => Promise<FileInfo>;
  onOpenThread: (messageId: string) => void;
  onTyping: () => void;
  onJoin: () => Promise<void>;
  onLoadOlder: () => Promise<void>;
  onHuddle: () => void;
  onBack: () => void;
}

function typingLine(names: string[]): string {
  if (names.length === 0) return '';
  if (names.length === 1) return `${names[0]} is typing…`;
  if (names.length === 2) return `${names[0]} and ${names[1]} are typing…`;
  return 'Several people are typing…';
}

export function ChannelView(p: Props) {
  const title = channelTitle(p.channel, p.me);
  const inThisHuddle = p.myHuddleChannelId === p.channel.id;
  const huddleCount = p.channel.huddle.length;
  const huddleLabel = inThisHuddle ? 'Open huddle' : huddleCount > 0 ? `Join huddle · ${huddleCount}` : 'Huddle';

  return (
    <section className="channel" aria-label={title}>
      <header className="pane-head">
        <button className="icon-btn mobile-only" aria-label="Back to channels" onClick={p.onBack}>
          <BackIcon size={18} />
        </button>
        <div className="pane-title">
          <h1>{title}</h1>
          {p.channel.topic && <p>{p.channel.topic}</p>}
        </div>
        {p.channel.isMember && (
          <button
            className={`btn huddle-btn${huddleCount > 0 ? ' live' : ''}`}
            onClick={p.onHuddle}
            title={inThisHuddle ? 'Show the huddle screen' : 'Start or join a voice huddle'}
          >
            <HeadphonesIcon size={16} />
            {huddleLabel}
          </button>
        )}
      </header>

      <MessageList
        channel={p.channel}
        me={p.me}
        users={p.users}
        messages={p.messages}
        hasMore={p.hasMore}
        activeThreadId={p.activeThreadId}
        onReact={p.onReact}
        onEdit={p.onEdit}
        onDelete={p.onDelete}
        onOpenThread={p.onOpenThread}
        onLoadOlder={p.onLoadOlder}
        emptyText={p.channel.isDm ? `This is the start of your conversation with ${title}.` : `This is the very beginning of ${title}.`}
      />

      <div className="typing" aria-live="polite">
        {typingLine(p.typingNames)}
      </div>

      {p.channel.isMember ? (
        <Composer
          placeholder={`Message ${title}`}
          users={p.users}
          onSend={p.onSend}
          onUpload={p.onUpload}
          onTyping={p.onTyping}
          focusKey={p.channel.id}
        />
      ) : (
        <div className="join-bar">
          <span>You are viewing {title}.</span>
          <button className="btn primary" onClick={() => void p.onJoin()}>
            Join channel
          </button>
        </div>
      )}
    </section>
  );
}
