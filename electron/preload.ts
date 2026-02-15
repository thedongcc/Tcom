import { ipcRenderer, contextBridge } from 'electron'

// --------- Expose some API to the Renderer process ---------
contextBridge.exposeInMainWorld('ipcRenderer', {
  on(...args: Parameters<typeof ipcRenderer.on>) {
    const [channel, listener] = args
    return ipcRenderer.on(channel, (event, ...args) => listener(event, ...args))
  },
  off(...args: Parameters<typeof ipcRenderer.off>) {
    const [channel, ...omit] = args
    return ipcRenderer.off(channel, ...omit)
  },
  send(...args: Parameters<typeof ipcRenderer.send>) {
    const [channel, ...omit] = args
    return ipcRenderer.send(channel, ...omit)
  },
  invoke(...args: Parameters<typeof ipcRenderer.invoke>) {
    const [channel, ...omit] = args
    return ipcRenderer.invoke(channel, ...omit)
  },

  // You can expose other APTs you need here.
  // ...
})

contextBridge.exposeInMainWorld('serialAPI', {
  listPorts: () => ipcRenderer.invoke('serial:list-ports'),
  open: (connectionId: string, options: any) => ipcRenderer.invoke('serial:open', { connectionId, options }),
  close: (connectionId: string) => ipcRenderer.invoke('serial:close', { connectionId }),
  write: (connectionId: string, data: string | number[] | Uint8Array) => ipcRenderer.invoke('serial:write', { connectionId, data }),
  onData: (connectionId: string, callback: (data: Uint8Array) => void) => {
    const listener = (_: any, args: { connectionId: string, data: Uint8Array }) => {
      if (args.connectionId === connectionId) {
        callback(args.data);
      }
    };
    ipcRenderer.on('serial:data', listener);
    return () => ipcRenderer.off('serial:data', listener);
  },
  onClosed: (connectionId: string, callback: () => void) => {
    const listener = (_: any, args: { connectionId: string }) => {
      if (args.connectionId === connectionId) {
        callback();
      }
    };
    ipcRenderer.on('serial:closed', listener);
    return () => ipcRenderer.off('serial:closed', listener);
  },
  onError: (connectionId: string, callback: (err: string) => void) => {
    const listener = (_: any, args: { connectionId: string, error: string }) => {
      if (args.connectionId === connectionId) {
        callback(args.error);
      }
    };
    ipcRenderer.on('serial:error', listener);
    return () => ipcRenderer.off('serial:error', listener);
  }
});

contextBridge.exposeInMainWorld('mqttAPI', {
  connect: (connectionId: string, config: any) => ipcRenderer.invoke('mqtt:connect', { connectionId, config }),
  disconnect: (connectionId: string) => ipcRenderer.invoke('mqtt:disconnect', { connectionId }),
  publish: (connectionId: string, topic: string, payload: any, options: any) => ipcRenderer.invoke('mqtt:publish', { connectionId, topic, payload, options }),
  subscribe: (connectionId: string, topic: string) => ipcRenderer.invoke('mqtt:subscribe', { connectionId, topic }),
  unsubscribe: (connectionId: string, topic: string) => ipcRenderer.invoke('mqtt:unsubscribe', { connectionId, topic }),

  onMessage: (connectionId: string, callback: (topic: string, payload: Uint8Array) => void) => {
    const listener = (_: any, args: { connectionId: string, topic: string, payload: Uint8Array }) => {
      if (args.connectionId === connectionId) {
        callback(args.topic, args.payload);
      }
    };
    ipcRenderer.on('mqtt:message', listener);
    return () => ipcRenderer.off('mqtt:message', listener);
  },

  onStatus: (connectionId: string, callback: (status: string) => void) => {
    const listener = (_: any, args: { connectionId: string, status: string }) => {
      if (args.connectionId === connectionId) {
        callback(args.status);
      }
    };
    ipcRenderer.on('mqtt:status', listener);
    return () => ipcRenderer.off('mqtt:status', listener);
  },

  onError: (connectionId: string, callback: (err: string) => void) => {
    const listener = (_: any, args: { connectionId: string, error: string }) => {
      if (args.connectionId === connectionId) {
        callback(args.error);
      }
    };
    ipcRenderer.on('mqtt:error', listener);
    return () => ipcRenderer.off('mqtt:error', listener);
  }
});

contextBridge.exposeInMainWorld('sessionAPI', {
  save: (sessions: any[]) => ipcRenderer.invoke('session:save', sessions),
  load: () => ipcRenderer.invoke('session:load')
});

contextBridge.exposeInMainWorld('workspaceAPI', {
  getLastWorkspace: () => ipcRenderer.invoke('workspace:getLastWorkspace'),
  setLastWorkspace: (wsPath: string | null) => ipcRenderer.invoke('workspace:setLastWorkspace', wsPath),
  openFolder: () => ipcRenderer.invoke('workspace:openFolder'),
  listSessions: (wsPath: string) => ipcRenderer.invoke('workspace:listSessions', wsPath),
  saveSession: (wsPath: string, config: any) => ipcRenderer.invoke('workspace:saveSession', wsPath, config),
  deleteSession: (wsPath: string, config: any) => ipcRenderer.invoke('workspace:deleteSession', wsPath, config),
  renameSession: (wsPath: string, oldName: string, newName: string) => ipcRenderer.invoke('workspace:renameSession', wsPath, oldName, newName),
  getRecentWorkspaces: () => ipcRenderer.invoke('workspace:getRecentWorkspaces'),
  migrateOldSessions: () => ipcRenderer.invoke('workspace:migrateOldSessions'),
});

contextBridge.exposeInMainWorld('com0comAPI', {
  exec: (command: string) => ipcRenderer.invoke('com0com:exec', command),
  installDriver: () => ipcRenderer.invoke('com0com:install')
});

contextBridge.exposeInMainWorld('tcpAPI', {
  start: (port: number) => ipcRenderer.invoke('tcp:start', port),
  stop: (port: number) => ipcRenderer.invoke('tcp:stop', port),
  write: (port: number, data: any) => ipcRenderer.invoke('tcp:write', { port, data }),
  onData: (callback: (port: number, data: Uint8Array) => void) => {
    const listener = (_: any, args: { port: number, data: Uint8Array }) => {
      callback(args.port, args.data);
    };
    ipcRenderer.on('tcp:data', listener);
    return () => ipcRenderer.off('tcp:data', listener);
  }
});
contextBridge.exposeInMainWorld('updateAPI', {
  check: () => ipcRenderer.invoke('update:check'),
  download: () => ipcRenderer.invoke('update:download'),
  install: () => ipcRenderer.invoke('update:install'),
  getVersion: () => ipcRenderer.invoke('app:version'),
  getStats: () => ipcRenderer.invoke('system:stats'),
  onStatus: (callback: (data: any) => void) => {

    const listener = (_: any, data: any) => callback(data);
    ipcRenderer.on('update:status', listener);
    return () => ipcRenderer.off('update:status', listener);
  },
  onProgress: (callback: (progress: any) => void) => {
    const listener = (_: any, progress: any) => callback(progress);
    ipcRenderer.on('update:progress', listener);
    return () => ipcRenderer.off('update:progress', listener);
  }
});

contextBridge.exposeInMainWorld('shellAPI', {
  openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url),
});
