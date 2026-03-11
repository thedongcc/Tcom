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
  listPorts: (options?: any) => ipcRenderer.invoke('serial:list-ports', options),
  open: (connectionId: string, options: any) => ipcRenderer.invoke('serial:open', { connectionId, options }),
  close: (connectionId: string) => ipcRenderer.invoke('serial:close', { connectionId }),
  write: (connectionId: string, data: string | number[] | Uint8Array) => ipcRenderer.invoke('serial:write', { connectionId, data }),
  onData: (connectionId: string, callback: (data: Uint8Array, timestamp?: number) => void) => {
    const listener = (_: any, args: { connectionId: string, data: Uint8Array, timestamp?: number }) => {
      if (args.connectionId === connectionId) {
        callback(args.data, args.timestamp);
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
  },
  // ⚡ 高精度主进程定时发送
  timedSendStart: (connectionId: string, data: number[], intervalMs: number) =>
    ipcRenderer.invoke('serial:timed-send-start', { connectionId, data, intervalMs }),
  timedSendStop: (connectionId: string) =>
    ipcRenderer.invoke('serial:timed-send-stop', { connectionId }),
  onTimedSendTick: (connectionId: string, callback: (data: number[], timestamp: number) => void) => {
    const listener = (_: any, args: { connectionId: string, data: number[], timestamp: number }) => {
      if (args.connectionId === connectionId) {
        callback(args.data, args.timestamp);
      }
    };
    ipcRenderer.on('serial:timed-send-tick', listener);
    return () => ipcRenderer.off('serial:timed-send-tick', listener);
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
  exec: (command: string, silent?: boolean) => ipcRenderer.invoke('com0com:exec', command, silent),
  installDriver: () => ipcRenderer.invoke('com0com:install'),
  setFriendlyName: (port: string, name: string) => ipcRenderer.invoke('com0com:name', { port, name }),
  isAdmin: () => ipcRenderer.invoke('app:is-admin'),
  checkPath: (path: string) => ipcRenderer.invoke('com0com:check', path),
  launchInstaller: () => ipcRenderer.invoke('com0com:launch-installer')
});

contextBridge.exposeInMainWorld('appAPI', {
  factoryReset: () => ipcRenderer.invoke('app:factory-reset')
});


contextBridge.exposeInMainWorld('monitorAPI', {
  start: (sessionId: string, config: any) => ipcRenderer.invoke('monitor:start', { sessionId, config }),
  stop: (sessionId: string) => ipcRenderer.invoke('monitor:stop', { sessionId }),
  write: (sessionId: string, target: 'virtual' | 'physical', data: any) => ipcRenderer.invoke('monitor:write', { sessionId, target, data }),
  onData: (sessionId: string, callback: (type: 'RX' | 'TX', data: Uint8Array) => void) => {
    const listener = (_: any, args: { sessionId: string, type: 'RX' | 'TX', data: Uint8Array }) => {
      if (args.sessionId === sessionId) {
        callback(args.type, args.data);
      }
    };
    ipcRenderer.on('monitor:data', listener);
    return () => ipcRenderer.off('monitor:data', listener);
  },
  onError: (sessionId: string, callback: (err: string) => void) => {
    const listener = (_: any, args: { sessionId: string, error: string }) => {
      if (args.sessionId === sessionId) {
        callback(args.error);
      }
    };
    ipcRenderer.on('monitor:error', listener);
    return () => ipcRenderer.off('monitor:error', listener);
  },
  onClosed: (sessionId: string, callback: (args: { origin: string, path: string }) => void) => {
    const listener = (_: any, args: { sessionId: string, origin: string, path: string }) => {
      if (args.sessionId === sessionId) {
        callback({ origin: args.origin, path: args.path });
      }
    };
    ipcRenderer.on('monitor:closed', listener);
    return () => ipcRenderer.off('monitor:closed', listener);
  },
  onPartnerStatus: (sessionId: string, callback: (connected: boolean) => void) => {
    const listener = (_: any, args: { sessionId: string, connected: boolean }) => {
      if (args.sessionId === sessionId) {
        callback(args.connected);
      }
    };
    ipcRenderer.on('monitor:partner-status', listener);
    return () => ipcRenderer.off('monitor:partner-status', listener);
  }
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
  listFonts: () => ipcRenderer.invoke('app:list-fonts'),
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
  showOpenDialog: (options: any) => ipcRenderer.invoke('shell:showOpenDialog', options),
});

contextBridge.exposeInMainWorld('windowAPI', {
  setAlwaysOnTop: (flag: boolean) => ipcRenderer.invoke('window:setAlwaysOnTop', flag),
  isAlwaysOnTop: () => ipcRenderer.invoke('window:isAlwaysOnTop'),
});

contextBridge.exposeInMainWorld('themeAPI', {
  loadAll: () => ipcRenderer.invoke('theme:loadAll'),
  openFolder: () => ipcRenderer.invoke('theme:openFolder'),
  openFile: (id: string) => ipcRenderer.invoke('theme:openFile', { id }),
  updateTitleBar: (colors: { bgColor: string, symbolColor: string }) => ipcRenderer.invoke('theme:updateTitleBar', colors),
  onStatusChanged: (callback: (isOpen: boolean) => void) => {
    const listener = (_: any, isOpen: boolean) => callback(isOpen);
    ipcRenderer.on('theme-editor:status-changed', listener);
    return () => ipcRenderer.off('theme-editor:status-changed', listener);
  },
  openThemeEditor: () => ipcRenderer.invoke('theme-editor:open'),
  closeThemeEditor: () => ipcRenderer.invoke('theme-editor:close'),
  isWindowOpen: () => ipcRenderer.invoke('theme-editor:is-open'),
  save: (id: string, themeDef: any) => ipcRenderer.invoke('theme-editor:save', { id, themeDef }),
  applyPreview: (edits: Record<string, string>) => ipcRenderer.send('theme-editor:preview', edits),
  getPendingEdits: (themeId: string) => ipcRenderer.invoke('theme-editor:get-pending', themeId),
  getAllPendingEdits: () => ipcRenderer.invoke('theme-editor:get-all-pending'),
  clearAllPendingEdits: () => ipcRenderer.invoke('theme-editor:clear-all-pending'),
  setPendingEdits: (themeId: string, edits: Record<string, string> | null) => ipcRenderer.send('theme-editor:set-pending', { themeId, edits }),
  startInspectorMode: () => ipcRenderer.send('theme-editor:start-inspector'),
  stopInspectorMode: () => ipcRenderer.send('theme-editor:stop-inspector'),
  stopInspector: () => ipcRenderer.send('theme-editor:stop-inspector'),
  componentPicked: (data: any) => ipcRenderer.send('theme-editor:component-picked', data),
  onComponentPicked: (callback: (data: { compKey: string | null, className: string, outerHTML: string }) => void) => {
    const listener = (_: any, data: any) => callback(data);
    ipcRenderer.on('theme-editor:component-picked', listener);
    return () => ipcRenderer.off('theme-editor:component-picked', listener);
  },
  onInspectorStarted: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on('theme-editor:start-inspector', listener);
    return () => ipcRenderer.off('theme-editor:start-inspector', listener);
  },
  onInspectorStopped: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on('theme-editor:inspector-stopped', listener);
    return () => ipcRenderer.off('theme-editor:inspector-stopped', listener);
  },
  getExpandedGroups: () => ipcRenderer.invoke('theme-editor:get-expanded-groups'),
  setExpandedGroups: (groups: Record<string, boolean>) => ipcRenderer.send('theme-editor:set-expanded-groups', groups),
  // 合并初始化接口：一次往返获取 pendingEdits + expandedGroups
  initData: () => ipcRenderer.invoke('theme-editor:init-data'),
  onApplyPreview: (callback: (edits: Record<string, string>) => void) => {
    const listener = (_: any, edits: Record<string, string>) => callback(edits);
    ipcRenderer.on('theme:apply-preview', listener);
    return () => ipcRenderer.off('theme:apply-preview', listener);
  },
  onEditorClosed: (callback: () => void) => {
    // We bind it to status-changed with isOpen == false
    const listener = (_: any, isOpen: boolean) => { if (!isOpen) callback(); };
    ipcRenderer.on('theme-editor:status-changed', listener);
    return () => ipcRenderer.off('theme-editor:status-changed', listener);
  },
  onReload: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on('theme:reload', listener);
    return () => ipcRenderer.off('theme:reload', listener);
  }
});

contextBridge.exposeInMainWorld('eyedropperAPI', {
  pick: () => ipcRenderer.invoke('eyedropper:pick'),
  watchStart: () => ipcRenderer.invoke('eyedropper:watch-start'),
  watchStop: () => ipcRenderer.invoke('eyedropper:watch-stop'),
  onColor: (cb: (color: string) => void) => {
    const listener = (_: any, color: string) => cb(color);
    ipcRenderer.on('eyedropper:color', listener);
    return () => ipcRenderer.off('eyedropper:color', listener);
  },
  onPicked: (cb: (color: string) => void) => {
    const listener = (_: any, color: string) => cb(color);
    ipcRenderer.on('eyedropper:picked', listener);
    return () => ipcRenderer.off('eyedropper:picked', listener);
  },
  onCanceled: (cb: () => void) => {
    const listener = () => cb();
    ipcRenderer.on('eyedropper:canceled', listener);
    return () => ipcRenderer.off('eyedropper:canceled', listener);
  }
});
