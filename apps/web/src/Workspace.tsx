import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import type { Channel, Message, MessagePage, RtcConfig, ServerEvent, User, UserSettings, UserWithPresence, Workspace as WorkspaceInfo } from '@relay/shared';
import { api, RealtimeClient, uploadFile } from './api';
import { desktop, notify, parseDeepLink } from './desktop';
import { channelTitle, plainBody } from './format';
import { HuddleSession } from './huddle';
import { parseRoute, routePath, type Route } from './routes';
import { playChime } from './sounds';
import { initialState, reducer } from './state';
import { ChannelView } from './ui/ChannelView';
import { ChannelSettings } from './ui/ChannelSettings';
import { HuddleAudio, HuddleBar, HuddleScreen, HuddleStage } from './ui/Huddle';
import { HuddleInvites, type HuddleInvite } from './ui/HuddleInvites';
import { People } from './ui/People';
import { Profile } from './ui/Profile';
import { SearchView } from './ui/SearchView';
import { Settings } from './ui/Settings';
import { Sidebar } from './ui/Sidebar';
import { Thread } from './ui/Thread';
import { WorkspaceRail } from './ui/WorkspaceRail';

const LAST_WORKSPACE_KEY = 'relay.lastWorkspace';
const lastChannelKey = (workspaceId: string) => `relay.lastChannel.${workspaceId}`;

function remember(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Not remembered across reloads.
  }
}

function recall(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

interface SearchState {
  query: string;
  results: Message[] | null;
  error: string | null;
}

interface HuddleState {
  session: HuddleSession;
  title: string;
  error: string | null;
}

export function Workspace({
  token,
  me,
  prefs,
  onPrefsChange,
  onSignOut,
}: {
  token: string;
  me: User;
  prefs: UserSettings;
  onPrefsChange: (patch: Partial<UserSettings>) => Promise<unknown>;
  onSignOut: () => void;
}) {
  const [state, dispatch] = useReducer(reducer, me, initialState);
  const stateRef = useRef(state);
  stateRef.current = state;
  // The realtime effect should not resubscribe every time a preference changes.
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;
  const realtime = useRef<RealtimeClient | null>(null);
  const [mobileView, setMobileView] = useState<'list' | 'channel'>('channel');
  const [search, setSearch] = useState<SearchState | null>(null);
  const [huddle, setHuddle] = useState<HuddleState | null>(null);
  const [huddleView, setHuddleView] = useState<'full' | 'mini'>('full');
  // One source of truth for what the shell shows. The URL mirrors it (so pages are
  // deep-linkable and the browser's Back button works), but state is never derived from it.
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.pathname));
  // Where closing a page returns to: the path we opened it from. A deep link has no
  // workspace behind it, so it returns to chat.
  const returnTo = useRef('/');
  const routeRef = useRef(route);
  routeRef.current = route;

  /** Navigates within the shell. `push` adds a history entry; otherwise the URL is just mirrored. */
  const navigate = useCallback((next: Route, push: boolean) => {
    const path = routePath(next);
    if (push) window.history.pushState({ relay: true }, '', path);
    else window.history.replaceState(window.history.state, '', path);
    setRoute(next);
  }, []);

  /** Set while a profile is open on top of the people list, so Back returns to the list. */
  const profileFromPeople = useRef(false);

  /**
   * Opens a page. It never stacks on another page — the workspace is one container, so
   * going to settings from people replaces it, exactly like choosing another screen in Slack.
   * The one exception is a profile opened from the people list, which Back returns to.
   */
  const openPage = useCallback(
    (next: Route) => {
      const from = routeRef.current.name;
      if (from === 'chat') returnTo.current = routePath(routeRef.current);
      profileFromPeople.current = from === 'people' && next.name === 'profile';
      navigate(next, from === 'chat' || profileFromPeople.current);
    },
    [navigate],
  );

  /** Back to the workspace view. Always works, whatever the URL or history happens to be. */
  const closePage = useCallback(() => {
    if (routeRef.current.name === 'chat') return;
    if (routeRef.current.name === 'profile' && profileFromPeople.current) {
      profileFromPeople.current = false;
      window.history.back();
      setRoute({ name: 'people' });
      return;
    }
    const back = returnTo.current;
    if (window.history.state?.relay && window.history.length > 1) window.history.back();
    else navigate(parseRoute(back), false);
    setRoute(parseRoute(back));
  }, [navigate]);

  // Browser Back / Forward: the URL is the truth again.
  useEffect(() => {
    const onPop = () => {
      const next = parseRoute(window.location.pathname);
      if (next.name !== 'profile') profileFromPeople.current = false;
      setRoute(next);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  // ⌘, / Ctrl+, opens settings; ⌘K / Ctrl+K jumps to search.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.metaKey && !e.ctrlKey) return;
      const key = e.key.toLowerCase();
      if (key === ',' && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        openPage({ name: 'settings', tab: 'profile' });
      } else if (key === 'k' && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        if (routeRef.current.name !== 'chat') closePage();
        document.getElementById('search-input')?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openPage, closePage]);

  const huddleRef = useRef(huddle);
  huddleRef.current = huddle;
  const [, bumpHuddle] = useReducer((n: number) => n + 1, 0);
  const rtcConfig = useRef<RtcConfig | null>(null);
  const [invites, setInvites] = useState<HuddleInvite[]>([]);
  const dismissInvite = useCallback((channelId: string) => setInvites((list) => list.filter((i) => i.channelId !== channelId)), []);

  const workspaceId = state.workspaceId;

  const loadWorkspaces = useCallback(async () => {
    const workspaces = await api<WorkspaceInfo[]>('/workspaces');
    dispatch({ type: 'workspaces', workspaces });
    return workspaces;
  }, []);
  const loadChannels = useCallback(async (wid: string) => {
    const channels = await api<Channel[]>(`/workspaces/${wid}/channels`);
    dispatch({ type: 'channels', workspaceId: wid, channels });
    return channels;
  }, []);
  const loadUsers = useCallback(async (wid: string) => {
    dispatch({ type: 'users', workspaceId: wid, users: await api<UserWithPresence[]>(`/workspaces/${wid}/users`) });
  }, []);
  const loadMessages = useCallback(async (channelId: string) => {
    const page = await api<MessagePage>(`/channels/${channelId}/messages`);
    dispatch({ type: 'messages', channelId, ...page });
  }, []);
  const loadReplies = useCallback(async (parentId: string) => {
    dispatch({ type: 'replies', parentId, replies: await api<Message[]>(`/messages/${parentId}/replies`) });
  }, []);

  const open = useCallback(
    (channelId: string) => {
      dispatch({ type: 'open', channelId });
      setSearch(null);
      setMobileView('channel');
      // A notification or deep link lands you on the message, even from a page.
      closePage();
      const wid = stateRef.current.workspaceId;
      if (wid) remember(lastChannelKey(wid), channelId);
    },
    [closePage],
  );

  const switchWorkspace = useCallback((wid: string) => {
    dispatch({ type: 'switch-workspace', workspaceId: wid });
    setSearch(null);
    remember(LAST_WORKSPACE_KEY, wid);
  }, []);

  /** Choosing a workspace from the rail: leave whatever page is open, like Slack does. */
  const pickWorkspace = useCallback(
    (wid: string) => {
      switchWorkspace(wid);
      closePage();
    },
    [switchWorkspace, closePage],
  );

  // First load: workspaces, then the last one used.
  useEffect(() => {
    loadWorkspaces()
      .then((workspaces) => {
        const last = recall(LAST_WORKSPACE_KEY);
        const pick = workspaces.find((w) => w.id === last) ?? workspaces[0];
        if (pick) switchWorkspace(pick.id);
      })
      .catch(console.error);
  }, [loadWorkspaces, switchWorkspace]);

  // On workspace change: its channels, members, and its last channel.
  useEffect(() => {
    if (!workspaceId) return;
    let cancelled = false;
    (async () => {
      const [channels] = await Promise.all([loadChannels(workspaceId), loadUsers(workspaceId)]);
      if (cancelled) return;
      const last = recall(lastChannelKey(workspaceId));
      const pick =
        channels.find((c) => c.id === last) ?? channels.find((c) => c.isMember && c.name === 'general') ?? channels.find((c) => c.isMember);
      dispatch({ type: 'open', channelId: pick?.id ?? null });
    })().catch(console.error);
    return () => {
      cancelled = true;
    };
  }, [workspaceId, loadChannels, loadUsers]);

  // Realtime connection. After a reconnect, refetch what may have been missed.
  useEffect(() => {
    let connectedBefore = false;
    const current = () => stateRef.current;

    const resync = () => {
      const s = current();
      void loadWorkspaces().catch(console.error);
      if (s.workspaceId) {
        void loadChannels(s.workspaceId).catch(console.error);
        void loadUsers(s.workspaceId).catch(console.error);
      }
      if (s.activeId) void loadMessages(s.activeId).catch(console.error);
      if (s.threadId) void loadReplies(s.threadId).catch(console.error);
    };

    const maybeNotify = (m: Message) => {
      const s = current();
      if (m.user.id === s.me.id) return;
      const channel = s.channels.find((c) => c.id === m.channelId);
      if (!channel) return;
      const mentioned = m.mentions.includes(s.me.id);
      // Threads only notify when they mention you.
      if (m.parentId && !mentioned) return;
      if (m.channelId === s.activeId && !document.hidden) return;
      // The "mentions" level still notifies for direct messages.
      if (prefsRef.current.notifyLevel === 'mentions' && !mentioned && !channel.isDm) return;
      if (!prefsRef.current.desktopNotifications) return;
      const title = mentioned ? `${m.user.name} mentioned you in ${channelTitle(channel, s.me)}` : channel.isDm ? m.user.name : channelTitle(channel, s.me);
      const text = plainBody(m.body, s.users) || (m.files.length ? `Shared ${m.files.length} file${m.files.length === 1 ? '' : 's'}` : '');
      const body = channel.isDm || mentioned ? text : `${m.user.name}: ${text}`;
      notify(title, body.slice(0, 240), m.channelId, open);
    };

    const onEvent = (ev: ServerEvent) => {
      const s = current();
      switch (ev.type) {
        case 'message.created':
          dispatch({ type: 'upsert', message: ev.message, created: true });
          maybeNotify(ev.message);
          break;
        case 'message.updated':
          dispatch({ type: 'upsert', message: ev.message, created: false });
          break;
        case 'message.deleted':
          dispatch({ type: 'remove', id: ev.id, channelId: ev.channelId, parentId: ev.parentId });
          break;
        case 'channels.changed':
          if (ev.workspaceId === s.workspaceId) void loadChannels(ev.workspaceId).catch(console.error);
          break;
        case 'workspaces.changed':
          void loadWorkspaces().catch(console.error);
          break;
        case 'members.changed':
          if (ev.workspaceId === s.workspaceId) void loadUsers(ev.workspaceId).catch(console.error);
          break;
        case 'typing':
          dispatch({ type: 'typing', channelId: ev.channelId, userId: ev.userId, name: ev.name });
          break;
        case 'presence':
          dispatch({ type: 'presence', userId: ev.userId, online: ev.online });
          break;
        case 'huddle.state': {
          dispatch({ type: 'huddle', channelId: ev.channelId, participants: ev.participants });
          const h = huddleRef.current;
          if (h && h.session.channelId === ev.channelId) h.session.setParticipants(ev.participants, ev.members);
          // The huddle ended before anyone answered: withdraw the invite.
          if (ev.participants.length === 0) dismissInvite(ev.channelId);
          break;
        }
        case 'huddle.started': {
          if (ev.by.id === s.me.id || huddleRef.current?.session.channelId === ev.channelId) break;
          const invite: HuddleInvite = {
            channelId: ev.channelId,
            workspaceId: ev.workspaceId,
            title: ev.isDm ? ev.by.name : `#${ev.channelName}`,
            isDm: ev.isDm,
            by: ev.by,
          };
          setInvites((list) => [...list.filter((i) => i.channelId !== ev.channelId), invite]);
          if (prefsRef.current.sound) playChime();
          if (prefsRef.current.desktopNotifications) {
            notify(ev.isDm ? `${ev.by.name} is calling you` : `${ev.by.name} started a huddle`, ev.isDm ? 'Open Relay to join' : `in #${ev.channelName}`, ev.channelId, open);
          }
          break;
        }
        case 'huddle.signal': {
          const h = huddleRef.current;
          if (h && h.session.channelId === ev.channelId) void h.session.handleSignal(ev.from, ev.data);
          break;
        }
      }
    };

    const rt = new RealtimeClient(token, onEvent, (status) => {
      if (status === 'unauthorized') {
        onSignOut();
        return;
      }
      dispatch({ type: 'status', status });
      if (status === 'online') {
        if (connectedBefore) resync();
        connectedBefore = true;
      }
    });
    realtime.current = rt;
    rt.connect();
    return () => {
      rt.close();
      realtime.current = null;
    };
  }, [token, onSignOut, loadWorkspaces, loadChannels, loadUsers, loadMessages, loadReplies, open, dismissInvite]);

  // Leave any huddle when this view goes away (sign-out).
  useEffect(() => () => huddleRef.current?.session.leave(), []);

  const active = state.channels.find((c) => c.id === state.activeId) ?? null;
  const activeMessages = state.activeId ? state.messages[state.activeId] : undefined;
  // The channel whose settings page is open, kept current so renames show while the page is up.
  const settingsChannel = route.name === 'channel-settings' ? (state.channels.find((c) => c.id === route.channelId) ?? null) : null;

  // A deep-linked channel settings path must resolve to a channel of the loaded workspace.
  useEffect(() => {
    if (route.name !== 'channel-settings' || settingsChannel) return;
    if (state.channels.length === 0) return; // The workspace is still loading.
    closePage();
  }, [route, settingsChannel, state.channels, closePage]);

  useEffect(() => {
    if (state.activeId) loadMessages(state.activeId).catch(console.error);
  }, [state.activeId, loadMessages]);

  useEffect(() => {
    if (state.threadId) loadReplies(state.threadId).catch(console.error);
  }, [state.threadId, loadReplies]);

  // Mark the open channel read while it is visible.
  const activeCount = activeMessages?.length ?? 0;
  const activeIsMember = active?.isMember ?? false;
  useEffect(() => {
    const id = state.activeId;
    if (!id || !activeIsMember) return;
    const mark = () => {
      if (document.hidden) return;
      dispatch({ type: 'read', channelId: id });
      api(`/channels/${id}/read`, { method: 'POST' }).catch(() => {});
    };
    const timer = window.setTimeout(mark, 400);
    document.addEventListener('visibilitychange', mark);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', mark);
    };
  }, [state.activeId, activeCount, activeIsMember]);

  // Unread total in the tab title and the dock badge.
  const totalUnread = useMemo(() => state.channels.reduce((n, c) => n + (c.isMember ? (c.isDm ? c.unread : c.mentions) : 0), 0), [state.channels]);
  useEffect(() => {
    document.title = totalUnread ? `(${totalUnread}) Relay` : 'Relay';
    void desktop?.setBadge(totalUnread);
  }, [totalUnread]);

  useEffect(() => {
    if (!desktop) return;
    return desktop.onDeepLink((url) => {
      const id = parseDeepLink(url);
      if (id) open(id);
    });
  }, [open]);

  const hasTyping = Object.values(state.typing).some((t) => Object.keys(t).length > 0);
  useEffect(() => {
    if (!hasTyping) return;
    const timer = window.setInterval(() => dispatch({ type: 'typing-expire' }), 1000);
    return () => window.clearInterval(timer);
  }, [hasTyping]);

  // --- Actions ---

  const send = useCallback(async (channelId: string, body: string, fileIds: string[], parentId?: string) => {
    const message = await api<Message>(`/channels/${channelId}/messages`, { body: { body, fileIds, parentId } });
    dispatch({ type: 'upsert', message, created: false });
  }, []);

  const messageActions = useMemo(
    () => ({
      onReact: async (messageId: string, emoji: string) => {
        const message = await api<Message>(`/messages/${messageId}/reactions`, { body: { emoji } });
        dispatch({ type: 'upsert', message, created: false });
      },
      onEdit: async (messageId: string, body: string) => {
        const message = await api<Message>(`/messages/${messageId}`, { method: 'PATCH', body: { body } });
        dispatch({ type: 'upsert', message, created: false });
      },
      onDelete: async (messageId: string) => {
        await api(`/messages/${messageId}`, { method: 'DELETE' });
      },
    }),
    [],
  );

  const createChannel = useCallback(
    async (name: string, isPrivate: boolean) => {
      if (!workspaceId) return;
      const { id } = await api<{ id: string }>(`/workspaces/${workspaceId}/channels`, { body: { name, isPrivate } });
      await loadChannels(workspaceId);
      open(id);
    },
    [workspaceId, loadChannels, open],
  );

  const join = useCallback(
    async (channelId: string) => {
      await api(`/channels/${channelId}/join`, { method: 'POST' });
      if (workspaceId) await loadChannels(workspaceId);
      open(channelId);
    },
    [workspaceId, loadChannels, open],
  );

  const startDm = useCallback(
    async (userId: string) => {
      if (!workspaceId) return;
      const { id } = await api<{ id: string }>(`/workspaces/${workspaceId}/dms`, { body: { userId } });
      await loadChannels(workspaceId);
      open(id);
    },
    [workspaceId, loadChannels, open],
  );

  /** Clicking a person anywhere — avatar, name or @mention — opens their profile. */
  const openUser = useCallback((userId: string) => openPage({ name: 'profile', userId }), [openPage]);

  /** Leaves whatever page is open and lands in the DM with them. */
  const messageUser = useCallback(
    (userId: string) => {
      if (profileFromPeople.current) {
        // Two pages deep: going back one step would land on the list, so swap the URL instead.
        profileFromPeople.current = false;
        navigate(parseRoute(returnTo.current), false);
      } else {
        closePage();
      }
      void startDm(userId).catch(console.error);
    },
    [closePage, navigate, startDm],
  );

  const createWorkspace = useCallback(
    async (name: string) => {
      const ws = await api<WorkspaceInfo>('/workspaces', { body: { name } });
      await loadWorkspaces();
      switchWorkspace(ws.id);
    },
    [loadWorkspaces, switchWorkspace],
  );

  const joinWorkspace = useCallback(
    async (code: string) => {
      const ws = await api<WorkspaceInfo>('/workspaces/join', { body: { code } });
      await loadWorkspaces();
      switchWorkspace(ws.id);
    },
    [loadWorkspaces, switchWorkspace],
  );

  const loadOlder = useCallback(async () => {
    const id = stateRef.current.activeId;
    const first = id ? stateRef.current.messages[id]?.[0] : undefined;
    if (!id || !first) return;
    const page = await api<MessagePage>(`/channels/${id}/messages?before=${encodeURIComponent(first.createdAt)}`);
    dispatch({ type: 'messages', channelId: id, ...page, older: true });
  }, []);

  const runSearch = useCallback(
    (query: string) => {
      if (!workspaceId) return;
      setSearch({ query, results: null, error: null });
      setMobileView('channel');
      api<Message[]>(`/workspaces/${workspaceId}/search?q=${encodeURIComponent(query)}`)
        .then((results) => setSearch((s) => (s?.query === query ? { ...s, results } : s)))
        .catch((err: Error) => setSearch((s) => (s?.query === query ? { ...s, error: err.message } : s)));
    },
    [workspaceId],
  );

  const openResult = useCallback(
    (m: Message) => {
      open(m.channelId);
      if (m.parentId) dispatch({ type: 'thread', id: m.parentId });
    },
    [open],
  );

  const leaveHuddle = useCallback(() => {
    huddleRef.current?.session.leave();
    setHuddle(null);
  }, []);

  const startHuddle = useCallback(
    async (channelId: string, title: string) => {
      dismissInvite(channelId);
      huddleRef.current?.session.leave();
      const rt = realtime.current;
      if (!rt) return;
      if (!rtcConfig.current) rtcConfig.current = await api<RtcConfig>('/rtc-config');
      const session = new HuddleSession(channelId, me.id, (ev) => rt.send(ev), rtcConfig.current, bumpHuddle);
      const next: HuddleState = { session, title, error: null };
      setHuddle(next);
      setHuddleView('full');
      try {
        await session.start();
      } catch (err) {
        session.leave();
        const denied = (err as DOMException).name === 'NotAllowedError';
        setHuddle({ ...next, error: denied ? 'Microphone access was blocked.' : 'Could not start the microphone.' });
        setTimeout(() => setHuddle((h) => (h?.session === session ? null : h)), 4000);
      }
    },
    [me, dismissInvite],
  );

  const joinInvite = useCallback(
    (invite: HuddleInvite) => {
      if (invite.workspaceId !== stateRef.current.workspaceId) {
        // Land on the huddle's channel once the other workspace loads.
        remember(lastChannelKey(invite.workspaceId), invite.channelId);
        switchWorkspace(invite.workspaceId);
      } else {
        open(invite.channelId);
      }
      void startHuddle(invite.channelId, invite.title);
    },
    [open, switchWorkspace, startHuddle],
  );

  const typingNames = state.activeId ? Object.values(state.typing[state.activeId] ?? {}).map((t) => t.name) : [];
  const threadParent = state.threadId && activeMessages ? activeMessages.find((m) => m.id === state.threadId) : undefined;
  const currentWorkspace = state.workspaces.find((w) => w.id === workspaceId) ?? null;
  const huddleParticipants = huddle ? (state.channels.find((c) => c.id === huddle.session.channelId)?.huddle ?? [me.id]) : [];

  return (
    <div
      className="app"
      data-view={mobileView}
      data-thread={state.threadId && !search ? 'open' : 'closed'}
      data-page={route.name === 'chat' ? undefined : route.name}
    >
      <WorkspaceRail
        workspaces={state.workspaces}
        activeId={workspaceId}
        onSwitch={pickWorkspace}
        onCreate={createWorkspace}
        onJoin={joinWorkspace}
      />
      <Sidebar
        me={state.me}
        workspace={currentWorkspace}
        status={state.status}
        channels={state.channels}
        users={state.users}
        activeId={search ? null : state.activeId}
        onOpen={open}
        onCreateChannel={createChannel}
        onJoin={join}
        onStartDm={startDm}
        onSearch={runSearch}
        onOpenSettings={() => openPage({ name: 'settings', tab: 'profile' })}
        onOpenPeople={() => openPage({ name: 'people' })}
        onSignOut={onSignOut}
        footer={
          huddle && (
            <HuddleBar
              session={huddle.session}
              title={huddle.title}
              participants={huddleParticipants}
              users={state.users}
              error={huddle.error}
              onOpen={() => setHuddleView('full')}
              onLeave={leaveHuddle}
            />
          )
        }
      />
      <main className="main">
        {route.name === 'settings' ? (
          <Settings
            me={state.me}
            prefs={prefs}
            onPrefsChange={onPrefsChange}
            onMeChange={(me) => dispatch({ type: 'me', me })}
            tab={route.tab}
            onTabChange={(tab) => navigate({ name: 'settings', tab }, false)}
            onBack={closePage}
            onSignOut={onSignOut}
          />
        ) : route.name === 'people' ? (
          <People
            workspace={currentWorkspace}
            members={Object.values(state.users)}
            meId={state.me.id}
            onMessage={messageUser}
            onOpenProfile={openUser}
            onBack={closePage}
          />
        ) : route.name === 'profile' ? (
          <Profile
            key={route.userId}
            user={state.users[route.userId] ?? null}
            meId={state.me.id}
            workspace={currentWorkspace}
            backLabel={profileFromPeople.current ? 'People' : 'Back'}
            onMessage={messageUser}
            onEditOwn={() => openPage({ name: 'settings', tab: 'profile' })}
            onBack={closePage}
          />
        ) : route.name === 'channel-settings' && settingsChannel ? (
          <ChannelSettings
            channel={settingsChannel}
            me={state.me}
            users={state.users}
            onBack={closePage}
            onLeft={(id) => {
              closePage();
              if (state.activeId === id) dispatch({ type: 'open', channelId: null });
            }}
          />
        ) : search ? (
          <SearchView
            query={search.query}
            results={search.results}
            error={search.error}
            channels={state.channels}
            me={state.me}
            users={state.users}
            onOpen={openResult}
            onClose={() => setSearch(null)}
          />
        ) : active ? (
          <ChannelView
            key={active.id}
            channel={active}
            me={state.me}
            users={state.users}
            messages={activeMessages}
            hasMore={state.hasMore[active.id] ?? false}
            typingNames={typingNames}
            activeThreadId={state.threadId}
            myHuddleChannelId={huddle?.session.channelId ?? null}
            onSend={(body, fileIds) => send(active.id, body, fileIds)}
            onUpload={(file) => uploadFile(active.id, file)}
            {...messageActions}
            onOpenThread={(id) => dispatch({ type: 'thread', id })}
            onTyping={() => realtime.current?.send({ type: 'typing', channelId: active.id })}
            onJoin={() => join(active.id)}
            onLoadOlder={loadOlder}
            onOpenUser={openUser}
            onHuddle={() =>
              huddle?.session.channelId === active.id ? setHuddleView('full') : void startHuddle(active.id, channelTitle(active, me))
            }
            onOpenSettings={() => openPage({ name: 'channel-settings', channelId: active.id })}
            onBack={() => setMobileView('list')}
          />
        ) : (
          <div className="center-screen muted">{state.workspaces.length ? 'Pick a channel to start.' : 'Create or join a workspace to start.'}</div>
        )}
      </main>
      {active && state.threadId && !search && route.name === 'chat' && (
        <Thread
          channel={active}
          me={state.me}
          users={state.users}
          parent={threadParent}
          replies={state.replies[state.threadId]}
          onClose={() => dispatch({ type: 'thread', id: null })}
          onSend={(body, fileIds) => send(active.id, body, fileIds, state.threadId!)}
          onUpload={(file) => uploadFile(active.id, file)}
          onOpenUser={openUser}
          {...messageActions}
        />
      )}
      {huddle && <HuddleAudio session={huddle.session} />}
      {huddle && huddleView === 'mini' && <HuddleStage session={huddle.session} users={state.users} onOpen={() => setHuddleView('full')} />}
      {huddle && huddleView === 'full' && (
        <HuddleScreen
          session={huddle.session}
          title={huddle.title}
          participants={huddleParticipants}
          users={state.users}
          me={state.me}
          error={huddle.error}
          onMinimize={() => setHuddleView('mini')}
          onLeave={leaveHuddle}
        />
      )}
      <HuddleInvites invites={invites} onJoin={joinInvite} onDismiss={dismissInvite} />
    </div>
  );
}
