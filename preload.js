const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld(
  'api', {
    // Settings
    getSettings: () => ipcRenderer.invoke('get-settings'),
    saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),
    selectDirectory: () => ipcRenderer.invoke('select-directory'),

    // Download
    startDownload: (settings) => ipcRenderer.invoke('start-download', settings),
    cancelDownload: () => ipcRenderer.invoke('cancel-download'),
    openDownloadDir: () => ipcRenderer.invoke('open-download-dir'),

    // Share downloads
    downloadShareAudio: (urls) => ipcRenderer.invoke('download-share-audio', urls),

    // Events
    onDownloadStatus: (callback) => {
      ipcRenderer.on('download-status', (event, status) => callback(status));
    },
    
    onDownloadProgress: (callback) => {
      ipcRenderer.on('download-progress', (event, data) => callback(data));
    },

    // Remove event listeners
    removeAllListeners: () => {
      ipcRenderer.removeAllListeners('download-status');
      ipcRenderer.removeAllListeners('download-progress');
    }
  }
);
