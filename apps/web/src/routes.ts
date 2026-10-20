/** The standalone pages (settings, people, channel settings) live at real paths, so they can be deep-linked and left with the browser's Back button. */

export type SettingsTab = 'profile' | 'notifications' | 'appearance' | 'security';

export type Route =
  | { name: 'chat' }
  | { name: 'settings'; tab: SettingsTab }
  | { name: 'people' }
  | { name: 'channel-settings'; channelId: string };

const SETTINGS_TABS: SettingsTab[] = ['profile', 'notifications', 'appearance', 'security'];

export function parseRoute(pathname: string): Route {
  const parts = pathname.split('/').filter(Boolean);
  if (parts[0] === 'settings') {
    const tab = parts[1] as SettingsTab | undefined;
    return { name: 'settings', tab: tab && SETTINGS_TABS.includes(tab) ? tab : 'profile' };
  }
  if (parts[0] === 'people') return { name: 'people' };
  if (parts[0] === 'channels' && parts[2] === 'settings' && parts[1]) return { name: 'channel-settings', channelId: parts[1] };
  return { name: 'chat' };
}

export function routePath(route: Route): string {
  switch (route.name) {
    case 'settings':
      return route.tab === 'profile' ? '/settings' : `/settings/${route.tab}`;
    case 'people':
      return '/people';
    case 'channel-settings':
      return `/channels/${route.channelId}/settings`;
    default:
      return '/';
  }
}
