const {contextBridge, ipcRenderer} = require('electron');
contextBridge.exposeInMainWorld('journal', {
  onBeforeClose: fn => ipcRenderer.on('app:before-close',fn), closeReady: () => ipcRenderer.send('app:close-ready'),
  exists: () => ipcRenderer.invoke('vault:exists'), create: p => ipcRenderer.invoke('vault:create',p), unlock: p => ipcRenderer.invoke('vault:unlock',p), save: d => ipcRenderer.invoke('vault:save',d), lock: () => ipcRenderer.invoke('vault:lock'), backup: () => ipcRenderer.invoke('vault:backup'), restore: () => ipcRenderer.invoke('vault:restore'), onLock: fn => ipcRenderer.on('vault:locked',fn)
});
