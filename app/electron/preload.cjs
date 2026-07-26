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

/**
 * The render server's port, passed as an argv flag by the main process.
 * Read synchronously so the renderer knows the API base before its first fetch,
 * rather than after an async IPC round trip.
 */
const portArg = process.argv.find((a) => a.startsWith("--api-port="));
const apiPort = portArg ? Number(portArg.split("=")[1]) : 3131;

contextBridge.exposeInMainWorld("desktop", {
  isDesktop: true,
  apiPort,

  getVersion: () => ipcRenderer.invoke("app:version"),

  checkForUpdates: () => ipcRenderer.invoke("update:check"),

  installUpdate: () => ipcRenderer.invoke("update:install"),

  openFolder: (folder) => ipcRenderer.invoke("shell:openFolder", folder),

  /** Native file picker — the renderer never sees a real path otherwise. */
  pickMedia: () => ipcRenderer.invoke("dialog:pickMedia"),

  /** Escape hatch when the in-app updater can't reach GitHub. */
  openReleases: () => ipcRenderer.invoke("shell:openReleases"),

  /** Returns an unsubscribe function so React effects can clean up properly. */
  onUpdateStatus: (callback) => {
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on("update:status", handler);
    return () => ipcRenderer.removeListener("update:status", handler);
  },
});
