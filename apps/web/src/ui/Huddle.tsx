import { useEffect, useRef, useState } from 'react';
import type { User } from '@relay/shared';
import { useSpeaking } from '../audio';
import type { HuddleSession, RemotePeer } from '../huddle';
import { Avatar } from './Avatar';
import { CloseIcon, ExpandIcon, LeaveIcon, MicIcon, MicOffIcon, ScreenIcon } from './icons';

function useShareToggle(session: HuddleSession) {
  const [error, setError] = useState<string | null>(null);
  const toggle = async () => {
    setError(null);
    try {
      if (session.sharing) session.stopShare();
      else await session.startShare();
    } catch (err) {
      if ((err as DOMException).name !== 'NotAllowedError') setError('Could not share the screen');
    }
  };
  return { toggle, error };
}

/** Plays every remote participant's audio. Mounted for the whole huddle, whichever view is showing. */
export function HuddleAudio({ session }: { session: HuddleSession }) {
  return (
    <>
      {session.remotes().map((r) => (r.audio ? <RemoteAudio key={r.userId} stream={r.audio} /> : null))}
    </>
  );
}

function RemoteAudio({ stream }: { stream: MediaStream }) {
  const ref = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    if (ref.current && ref.current.srcObject !== stream) ref.current.srcObject = stream;
  }, [stream]);
  return <audio ref={ref} autoPlay />;
}

function Video({ stream, label, className }: { stream: MediaStream; label: string; className?: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (ref.current && ref.current.srcObject !== stream) ref.current.srcObject = stream;
  }, [stream]);
  // Expose the picture's aspect ratio to CSS (--ar) so the frame can fit it exactly.
  const syncAspect = () => {
    const v = ref.current;
    if (v?.videoWidth && v.videoHeight) v.style.setProperty('--ar', String(v.videoWidth / v.videoHeight));
  };
  return (
    <video ref={ref} className={className} autoPlay playsInline muted aria-label={label} onLoadedMetadata={syncAspect} onResize={syncAspect} />
  );
}

interface BarProps {
  session: HuddleSession;
  title: string;
  participants: string[];
  users: Record<string, User>;
  error: string | null;
  onOpen: () => void;
  onLeave: () => void;
}

/** Compact controls docked at the bottom of the sidebar while the huddle screen is minimised. */
export function HuddleBar({ session, title, participants, users, error, onOpen, onLeave }: BarProps) {
  const share = useShareToggle(session);
  return (
    <section className="huddle-bar" aria-label="Huddle controls">
      <div className="huddle-bar-head">
        <span className="live-dot" aria-hidden="true" />
        <span className="huddle-bar-title">Huddle in {title}</span>
      </div>
      <div className="huddle-people">{participants.map((id) => (users[id] ? <Avatar key={id} user={users[id]} size={26} /> : null))}</div>
      {(error || share.error) && (
        <p className="form-error on-dark" role="alert">
          {error ?? share.error}
        </p>
      )}
      <div className="huddle-controls">
        <button
          className={`huddle-ctl${session.muted ? ' danger' : ''}`}
          aria-pressed={session.muted}
          aria-label={session.muted ? 'Unmute microphone' : 'Mute microphone'}
          title={session.muted ? 'Unmute' : 'Mute'}
          onClick={() => session.setMuted(!session.muted)}
        >
          {session.muted ? <MicOffIcon size={18} /> : <MicIcon size={18} />}
        </button>
        <button
          className={`huddle-ctl${session.sharing ? ' on' : ''}`}
          aria-pressed={session.sharing}
          aria-label={session.sharing ? 'Stop sharing your screen' : 'Share your screen'}
          title={session.sharing ? 'Stop sharing' : 'Share screen'}
          onClick={() => void share.toggle()}
        >
          <ScreenIcon size={18} />
        </button>
        <button className="huddle-ctl" aria-label="Open the huddle screen" title="Open huddle" onClick={onOpen}>
          <ExpandIcon size={17} />
        </button>
        <button className="huddle-ctl leave" aria-label="Leave huddle" title="Leave" onClick={onLeave}>
          <LeaveIcon size={18} />
        </button>
      </div>
    </section>
  );
}

/** Floating viewer for shared screens while the huddle screen is minimised. */
export function HuddleStage({ session, users, onOpen }: { session: HuddleSession; users: Record<string, User>; onOpen: () => void }) {
  const [hidden, setHidden] = useState(false);
  const screens = session.remotes().filter((r) => r.screen);
  if (screens.length === 0) return null;
  if (hidden) {
    return (
      <button className="stage-reopen btn" onClick={() => setHidden(false)}>
        <ScreenIcon size={16} /> Show shared screen
      </button>
    );
  }
  return (
    <section className="stage" aria-label="Shared screens">
      <div className="stage-head">
        <button className="stage-title" onClick={onOpen}>
          {users[screens[0].userId]?.name ?? 'Someone'} is sharing · Open huddle
        </button>
        <button className="icon-btn on-dark" aria-label="Hide shared screen" onClick={() => setHidden(true)}>
          <CloseIcon size={16} />
        </button>
      </div>
      <Video stream={screens[0].screen!} label="Shared screen" className="stage-video" />
    </section>
  );
}

interface ScreenProps {
  session: HuddleSession;
  title: string;
  participants: string[];
  users: Record<string, User>;
  me: User;
  error: string | null;
  onMinimize: () => void;
  onLeave: () => void;
}

/** The full huddle window: shared screen, participant tiles and call controls. */
export function HuddleScreen({ session, title, participants, users, me, error, onMinimize, onLeave }: ScreenProps) {
  const root = useRef<HTMLDivElement>(null);
  const share = useShareToggle(session);
  const [focusId, setFocusId] = useState<string | null>(null);

  useEffect(() => {
    root.current?.focus();
  }, []);

  const remotes = new Map(session.remotes().map((r) => [r.userId, r]));
  const ids = participants.includes(me.id) ? participants : [me.id, ...participants];
  const screens = [...remotes.values()].filter((r) => r.screen);
  const focused = screens.find((r) => r.userId === focusId) ?? screens[0];
  const showStage = Boolean(focused) || session.sharing;

  return (
    <div
      ref={root}
      className="hs"
      role="dialog"
      aria-modal="true"
      aria-label={`Huddle in ${title}`}
      tabIndex={-1}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onMinimize();
      }}
    >
      <header className="hs-head">
        <span className="live-dot" aria-hidden="true" />
        <h1>Huddle in {title}</h1>
        <span className="hs-count">
          {ids.length} {ids.length === 1 ? 'person' : 'people'}
        </span>
        <button className="hs-pill" onClick={onMinimize}>
          Back to chat
        </button>
      </header>

      <div className={`hs-body${showStage ? ' with-stage' : ''}`}>
        {focused ? (
          <section className="hs-stage" aria-label={`${users[focused.userId]?.name ?? 'Someone'}'s screen`}>
            <Video stream={focused.screen!} label={`${users[focused.userId]?.name ?? 'Someone'}'s screen`} className="hs-video" />
            <p className="hs-caption">
              <ScreenIcon size={14} /> {users[focused.userId]?.name ?? 'Someone'}'s screen
            </p>
          </section>
        ) : session.sharing ? (
          <section className="hs-stage self">
            <ScreenIcon size={28} />
            <p>You are sharing your screen.</p>
            <button className="hs-pill" onClick={() => void share.toggle()}>
              Stop sharing
            </button>
          </section>
        ) : null}

        <section className="hs-tiles" aria-label="Participants">
          {ids.map((id) => {
            const user = users[id] ?? (id === me.id ? me : null);
            if (!user) return null;
            const isMe = id === me.id;
            const remote = remotes.get(id);
            const status = session.statusOf(id);
            return (
              <Tile
                key={id}
                user={user}
                isMe={isMe}
                stream={isMe ? session.localAudio : (remote?.audio ?? null)}
                muted={isMe ? session.muted : (status?.muted ?? false)}
                sharing={isMe ? session.sharing : (status?.sharing ?? false)}
                remote={remote}
                focused={focused?.userId === id}
                onFocus={remote?.screen ? () => setFocusId(id) : undefined}
              />
            );
          })}
        </section>
      </div>

      {(error || share.error) && (
        <p className="hs-error" role="alert">
          {error ?? share.error}
        </p>
      )}

      <footer className="hs-controls">
        <button
          className={`hs-ctl${session.muted ? ' danger' : ''}`}
          aria-pressed={session.muted}
          onClick={() => session.setMuted(!session.muted)}
        >
          <span className="hs-ctl-icon">{session.muted ? <MicOffIcon size={22} /> : <MicIcon size={22} />}</span>
          {session.muted ? 'Unmute' : 'Mute'}
        </button>
        <button className={`hs-ctl${session.sharing ? ' on' : ''}`} aria-pressed={session.sharing} onClick={() => void share.toggle()}>
          <span className="hs-ctl-icon">
            <ScreenIcon size={22} />
          </span>
          {session.sharing ? 'Stop sharing' : 'Share screen'}
        </button>
        <button className="hs-ctl leave" onClick={onLeave}>
          <span className="hs-ctl-icon">
            <LeaveIcon size={22} />
          </span>
          Leave
        </button>
      </footer>
    </div>
  );
}

interface TileProps {
  user: User;
  isMe: boolean;
  stream: MediaStream | null;
  muted: boolean;
  sharing: boolean;
  remote: RemotePeer | undefined;
  focused: boolean;
  onFocus?: () => void;
}

function Tile({ user, isMe, stream, muted, sharing, remote, focused, onFocus }: TileProps) {
  const speaking = useSpeaking(muted ? null : stream);
  const connecting = !isMe && remote !== undefined && remote.connection !== 'connected';
  const body = (
    <>
      <Avatar user={user} size={72} />
      <span className="hs-name">{isMe ? `${user.name} (you)` : user.name}</span>
      <span className="hs-state">
        {muted && (
          <span className="hs-muted" aria-label="Muted">
            <MicOffIcon size={14} /> Muted
          </span>
        )}
        {sharing && <span className="hs-sharing">Sharing</span>}
        {connecting && <span>Connecting…</span>}
        {speaking && !muted && <span className="sr-only">Speaking</span>}
      </span>
    </>
  );
  const className = `hs-tile${speaking && !muted ? ' speaking' : ''}${focused ? ' focused' : ''}`;
  return onFocus ? (
    <button className={className} onClick={onFocus} aria-label={`Show ${user.name}'s screen`}>
      {body}
    </button>
  ) : (
    <div className={className}>{body}</div>
  );
}
