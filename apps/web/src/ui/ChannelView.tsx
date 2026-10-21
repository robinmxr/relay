import type { Channel, FileInfo, Message, User } from '@relay/shared';
import { channelTitle } from '../format';
import { Composer } from './Composer';
import { Avatar } from './Avatar';
import { BackIcon, GearIcon, HashIcon, HeadphonesIcon, LockIcon } from './icons';
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
  onOpenSettings: () => void;
  onBack: () => void;
  /** Opens a person's profile. */
  onOpenUser?: (userId: string) => void;
}

function typingLine(names: string[]): string {
  if (names.length === 0) return '';
  if (names.length === 1) return `${names[0]} is typing…`;
  if (names.length === 2) return `${names[0]} and ${names[1]} are typing…`;
  return 'Several people are typing…';
}

export function ChannelView(p: Props) {
  const title = channelTitle(p.channel, p.me);
  // Prefer the live copy from the member list: it carries status changes since the channel loaded.
  const peer = p.channel.isDm ? (p.users[p.channel.dmUser?.id ?? p.me.id] ?? p.channel.dmUser ?? p.me) : null;
  const archived = p.channel.archivedAt !== null;
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
          <h1>
            {peer && p.onOpenUser ? (
              <button className="as-btn pane-title-link" title={`View ${title}'s profile`} onClick={() => p.onOpenUser?.(peer.id)}>
                {title}
              </button>
            ) : (
              title
            )}
            {archived && <span className="pill">archived</span>}
          </h1>
          {peer?.status ? (
            <p>
              {peer.status.emoji} {peer.status.text}
            </p>
          ) : (
            p.channel.topic && <p>{p.channel.topic}</p>
          )}
        </div>
        {p.channel.isMember && !p.channel.isDm && (
          <button className="icon-btn" aria-label="Channel settings" title="Channel settings" onClick={p.onOpenSettings}>
            <GearIcon />
          </button>
        )}
        {p.channel.isMember && !archived && (
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
        onOpenUser={p.onOpenUser}
        intro={<ChannelIntro channel={p.channel} me={p.me} title={title} onOpenUser={p.onOpenUser} />}
      />

      <div className="typing" aria-live="polite">
        {typingLine(p.typingNames)}
      </div>

      {p.channel.isMember ? (
        archived ? (
          <div className="join-bar">
            <span>#{p.channel.name} is archived. It stays readable, but new messages are disabled.</span>
            <button className="btn" onClick={p.onOpenSettings}>
              Restore channel
            </button>
          </div>
        ) : (
          <Composer
            placeholder={`Message ${title}`}
            users={p.users}
            onSend={p.onSend}
            onUpload={p.onUpload}
            onTyping={p.onTyping}
            focusKey={p.channel.id}
          />
        )
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

/** The top of a conversation: what this place is, before anyone said anything. */
function ChannelIntro({ channel, me, title, onOpenUser }: { channel: Channel; me: User; title: string; onOpenUser?: (userId: string) => void }) {
  const peer = channel.isDm ? (channel.dmUser ?? me) : null;
  return (
    <div className="channel-start">
      {peer ? (
        <Avatar user={peer} size={64} />
      ) : (
        <span className="channel-start-icon" aria-hidden="true">
          {channel.isPrivate ? <LockIcon size={26} /> : <HashIcon size={26} />}
        </span>
      )}
      <h2>{peer ? title : channel.name}</h2>
      {!peer && channel.topic && <p className="channel-start-topic">{channel.topic}</p>}
      <p>
        {peer
          ? peer.id === me.id
            ? 'Your own space: notes, drafts, links to come back to.'
            : `This is the start of your conversation with ${peer.name}.`
          : `This is the very beginning of ${title}.`}
      </p>
      {peer && peer.id !== me.id && onOpenUser && (
        <button className="btn small" onClick={() => onOpenUser(peer.id)}>
          View profile
        </button>
      )}
    </div>
  );
}
