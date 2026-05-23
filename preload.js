const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    loadData: () => ipcRenderer.invoke('db:load'),
    saveData: (data) => ipcRenderer.invoke('db:save', data)
});
