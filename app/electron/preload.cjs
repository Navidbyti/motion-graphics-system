/**
 * Preload bridge.
 *
 * CommonJS deliberately — preload scripts are the one place where ESM support
 * is still awkward across Electron versions, and this file is too small to be
 * worth the risk.
 *
 * Only these five calls cross the boundary. The renderer has no Node access:
 * everything else it needs comes from the local HTTP server.
 */

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("desktop", {
  isDesktop: true,

  getVersion: () => ipcRenderer.invoke("app:version"),

  checkForUpdates: () => ipcRenderer.invoke("update:check"),

  installUpdate: () => ipcRenderer.invoke("update:install"),

  openFolder: (folder) => ipcRenderer.invoke("shell:openFolder", folder),

  /** Returns an unsubscribe function so React effects can clean up properly. */
  onUpdateStatus: (callback) => {
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on("update:status", handler);
    return () => ipcRenderer.removeListener("update:status", handler);
  },
});
