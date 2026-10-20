import type { ClientEvent, HuddleMember, HuddleSignal, RtcConfig } from '@relay/shared';

interface Peer {
  id: string;
  pc: RTCPeerConnection;
  /** "Perfect negotiation": the polite side yields when both send offers at once. */
  polite: boolean;
  makingOffer: boolean;
  ignoreOffer: boolean;
  audio: MediaStream | null;
  screen: MediaStream | null;
  screenSender: RTCRtpSender | null;
}

export interface RemotePeer {
  userId: string;
  audio: MediaStream | null;
  /** Present while the peer is sharing a screen. */
  screen: MediaStream | null;
  connection: RTCPeerConnectionState;
}

/**
 * One huddle from this client's side: a mesh of peer connections, one per other participant.
 * Audio and an optional screen-share video track go peer to peer; signalling goes through the
 * server's WebSocket. Fine for small groups; larger calls would need an SFU.
 */
export class HuddleSession {
  muted = false;
  /** Everyone's mute/share status, as last reported by the server. */
  private members = new Map<string, HuddleMember>();
  private peers = new Map<string, Peer>();
  /** Per-peer chain so offers and their ICE candidates are applied strictly in arrival order. */
  private signalChain = new Map<string, Promise<void>>();
  private local: MediaStream | null = null;
  private screen: MediaStream | null = null;
  private closed = false;

  constructor(
    readonly channelId: string,
    private meId: string,
    private send: (ev: ClientEvent) => void,
    private rtc: RtcConfig,
    private onChange: () => void,
  ) {}

  async start(): Promise<void> {
    this.local = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      video: false,
    });
    if (this.closed) {
      this.stopTracks();
      return;
    }
    this.send({ type: 'huddle.join', channelId: this.channelId });
  }

  get sharing(): boolean {
    return this.screen !== null;
  }

  get localScreen(): MediaStream | null {
    return this.screen;
  }

  get localAudio(): MediaStream | null {
    return this.local;
  }

  statusOf(userId: string): HuddleMember | undefined {
    return this.members.get(userId);
  }

  remotes(): RemotePeer[] {
    return [...this.peers.values()].map((p) => ({
      userId: p.id,
      audio: p.audio,
      screen: p.screen?.getVideoTracks().some((t) => t.readyState === 'live' && !t.muted) ? p.screen : null,
      connection: p.pc.connectionState,
    }));
  }

  /** Called with the server's participant list. Opens and closes peer connections to match. */
  setParticipants(ids: string[], members: HuddleMember[] = []): void {
    if (this.closed) return;
    this.members = new Map(members.map((m) => [m.userId, m]));
    for (const id of ids) if (id !== this.meId && !this.peers.has(id)) this.createPeer(id);
    for (const id of [...this.peers.keys()]) if (!ids.includes(id)) this.closePeer(id);
    this.onChange();
  }

  async handleSignal(from: string, data: HuddleSignal): Promise<void> {
    if (this.closed) return;
    // Signals arrive as separate messages but must apply one at a time: a
    // candidate processed while the offer's setRemoteDescription is still in
    // flight would be rejected and lost.
    const previous = this.signalChain.get(from) ?? Promise.resolve();
    const next = previous.then(() => this.applySignal(from, data)).catch((err) => console.error('huddle signal failed', err));
    this.signalChain.set(from, next);
    await next;
  }

  private async applySignal(from: string, data: HuddleSignal): Promise<void> {
    if (this.closed) return;
    const peer = this.peers.get(from) ?? this.createPeer(from);
    const { pc } = peer;
    try {
      if (data.description) {
        const collision = data.description.type === 'offer' && (peer.makingOffer || pc.signalingState !== 'stable');
        peer.ignoreOffer = !peer.polite && collision;
        if (peer.ignoreOffer) return;
        await pc.setRemoteDescription(data.description as RTCSessionDescriptionInit);
        if (data.description.type === 'offer') {
          await pc.setLocalDescription();
          this.signal(from, { description: pc.localDescription!.toJSON() });
        }
      } else if (data.candidate) {
        try {
          await pc.addIceCandidate(data.candidate);
        } catch (err) {
          if (!peer.ignoreOffer) throw err;
        }
      }
    } catch (err) {
      console.error('huddle signalling failed', err);
    }
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    for (const t of this.local?.getAudioTracks() ?? []) t.enabled = !muted;
    this.sendStatus();
    this.onChange();
  }

  async startShare(): Promise<void> {
    const stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 15 }, audio: false });
    const track = stream.getVideoTracks()[0];
    if (!track || this.closed) {
      stream.getTracks().forEach((t) => t.stop());
      return;
    }
    track.onended = () => this.stopShare();
    this.screen = stream;
    for (const p of this.peers.values()) p.screenSender = p.pc.addTrack(track, stream);
    this.sendStatus();
    this.onChange();
  }

  stopShare(): void {
    if (!this.screen) return;
    for (const p of this.peers.values()) {
      if (p.screenSender && p.pc.signalingState !== 'closed') p.pc.removeTrack(p.screenSender);
      p.screenSender = null;
    }
    this.screen.getTracks().forEach((t) => t.stop());
    this.screen = null;
    this.sendStatus();
    this.onChange();
  }

  leave(): void {
    if (this.closed) return;
    this.closed = true;
    this.send({ type: 'huddle.leave' });
    this.stopShare();
    for (const id of [...this.peers.keys()]) this.closePeer(id);
    this.stopTracks();
    this.onChange();
  }

  private createPeer(id: string): Peer {
    const pc = new RTCPeerConnection({ iceServers: this.rtc.iceServers });
    const peer: Peer = { id, pc, polite: this.meId > id, makingOffer: false, ignoreOffer: false, audio: null, screen: null, screenSender: null };
    this.peers.set(id, peer);

    if (this.local) for (const t of this.local.getTracks()) pc.addTrack(t, this.local);
    const screenTrack = this.screen?.getVideoTracks()[0];
    if (screenTrack && this.screen) peer.screenSender = pc.addTrack(screenTrack, this.screen);

    pc.onnegotiationneeded = async () => {
      if (this.closed || pc.signalingState === 'closed') return;
      try {
        peer.makingOffer = true;
        await pc.setLocalDescription();
        this.signal(id, { description: pc.localDescription!.toJSON() });
      } catch (err) {
        console.error('huddle negotiation failed', err);
      } finally {
        peer.makingOffer = false;
      }
    };
    pc.onicecandidate = ({ candidate }) => {
      if (candidate) this.signal(id, { candidate: candidate.toJSON() as HuddleSignal['candidate'] });
    };
    pc.ontrack = ({ track, streams }) => {
      const stream = streams[0] ?? new MediaStream([track]);
      if (track.kind === 'audio') {
        peer.audio = stream;
      } else {
        peer.screen = stream;
        track.onmute = track.onunmute = track.onended = () => this.onChange();
        stream.onremovetrack = () => this.onChange();
      }
      this.onChange();
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed') pc.restartIce();
      this.onChange();
    };
    return peer;
  }

  private closePeer(id: string): void {
    this.peers.get(id)?.pc.close();
    this.peers.delete(id);
    this.signalChain.delete(id);
  }

  private stopTracks(): void {
    this.local?.getTracks().forEach((t) => t.stop());
    this.local = null;
  }

  private sendStatus(): void {
    if (!this.closed) this.send({ type: 'huddle.status', muted: this.muted, sharing: this.sharing });
  }

  private signal(to: string, data: HuddleSignal): void {
    this.send({ type: 'huddle.signal', to, data });
  }
}
