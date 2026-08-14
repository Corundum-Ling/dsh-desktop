const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('pluginApi', {
  list: () => ipcRenderer.invoke('plugins:list'),
  install: (spec) => ipcRenderer.invoke('plugins:install', spec),
  remove: (name) => ipcRenderer.invoke('plugins:remove', name),
  restart: () => ipcRenderer.invoke('dsh:restart'),
})
