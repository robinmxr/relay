// Sandboxed preload: the only bridge between the web client and the OS. It exposes a fixed set of
// functions as `window.desktop`, never ipcRenderer itself. Written without import/export so tsc emits
// a plain script, which is what a sandboxed preload can load.

const { contextBridge, ipcRenderer } = require('electron') as typeof import('electron');

contextBridge.exposeInMainWorld('desktop', {
  platform: process.platform,

  notify: (opts: { title?: unknown; body?: unknown; channelId?: unknown }) =>
    ipcRenderer.invoke('desktop:notify', {
      title: String(opts?.title ?? ''),
      body: String(opts?.body ?? ''),
      channelId: typeof opts?.channelId === 'string' ? opts.channelId : undefined,
    }),

  setBadge: (count: unknown) => ipcRenderer.invoke('desktop:set-badge', Number(count)),

  onDeepLink: (cb: (url: string) => void) => {
    const listener = (_event: unknown, url: unknown) => {
      if (typeof url === 'string') cb(url);
    };
    ipcRenderer.on('desktop:deep-link', listener);
    void ipcRenderer.invoke('desktop:take-pending-link').then((url: unknown) => {
      if (typeof url === 'string') cb(url);
    });
    return () => {
      ipcRenderer.removeListener('desktop:deep-link', listener);
    };
  },
});
