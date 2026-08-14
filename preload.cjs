const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('pluginApi', {
  list: () => ipcRenderer.invoke('plugins:list'),
  setEnabled: (entryId, enabled) => ipcRenderer.invoke('plugins:set-enabled', entryId, enabled),
  install: (spec) => ipcRenderer.invoke('plugins:install', spec),
  remove: (name) => ipcRenderer.invoke('plugins:remove', name),
  removeInsert: (rowId) => ipcRenderer.invoke('plugins:remove-insert', rowId),
  marketplace: (refresh) => ipcRenderer.invoke('marketplace:get', refresh),
  listProfiles: () => ipcRenderer.invoke('profiles:list'),
  createProfile: (name, template) => ipcRenderer.invoke('profiles:create', name, template),
  renameProfile: (oldName, newName) => ipcRenderer.invoke('profiles:rename', oldName, newName),
  removeProfile: (name) => ipcRenderer.invoke('profiles:remove', name),
  copyProfile: (from, to) => ipcRenderer.invoke('profiles:copy', from, to),
  switchProfile: (name) => ipcRenderer.invoke('profiles:switch', name),
  restart: () => ipcRenderer.invoke('dsh:restart'),
})

contextBridge.exposeInMainWorld('themeApi', {
  get: () => ipcRenderer.invoke('theme:get'),
  onChange: (cb) => {
    ipcRenderer.on('theme:changed', (_e, theme) => cb(theme))
  },
})

contextBridge.exposeInMainWorld('windowApi', {
  minimize: () => ipcRenderer.send('window:minimize'),
  toggleMaximize: () => ipcRenderer.send('window:toggle-maximize'),
  close: () => ipcRenderer.send('window:close'),
})
