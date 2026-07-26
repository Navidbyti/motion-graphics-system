/**
 * ELECTRON MAIN PROCESS
 *
 * Owns three things: the window, the render server, and updates.
 *
 * The render server runs inside this process rather than as a child. Rendering
 * is CPU-bound but it happens in Remotion's own worker/browser processes, so the
 * main process stays responsive — and one process means no orphaned node.exe
 * left running if the app is force-quit.
 */

import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BrowserWindow, app, ipcMain, shell } from "electron";
import electronUpdater from "electron-updater";

const { autoUpdater } = electronUpdater;
const here = path.dirname(fileURLToPath(import.meta.url));
const isDev = !app.isPackaged;

/* ------------------------------------------------------------------ *
 * Environment — must happen before the server module is imported
 * ------------------------------------------------------------------ */

/**
 * ES module imports are fully evaluated before the importing module's body, so
 * a static `import` of the server would read process.env before this runs — the
 * proxy setting would be missing and every Google call would 403. The server is
 * therefore loaded with a dynamic import, after this. (This exact ordering bug
 * cost an afternoon; see PLAN.md Phase 4.)
 */
const loadEnvironment = () => {
  // Dev: the repo's .env. Packaged: the user's own, which is never shipped.
  const candidates = isDev
    ? [path.resolve(here, "..", "..", ".env")]
    : [path.join(app.getPath("userData"), ".env")];

  for (const file of candidates) {
    if (existsSync(file)) {
      try {
        process.loadEnvFile(file);
        console.log(`[env] loaded ${file}`);
        return file;
      } catch (err) {
        console.error(`[env] failed to load ${file}:`, err.message);
      }
    }
  }
  console.log("[env] no .env found — using defaults");
  return null;
};

/**
 * Find a port nothing else is holding.
 *
 * Without this the server silently fails to bind and the app talks to whatever
 * already owns 3131 — during development that was a stale dev server, and it
 * answered health checks convincingly enough to look like a pass. On someone
 * else's machine it could be anything at all.
 */
const findFreePort = async (start) => {
  const net = await import("node:net");
  for (let port = start; port < start + 20; port++) {
    const free = await new Promise((resolve) => {
      const probe = net.createServer();
      probe.once("error", () => resolve(false));
      probe.once("listening", () => probe.close(() => resolve(true)));
      probe.listen(port, "127.0.0.1");
    });
    if (free) return port;
  }
  return start;
};

/** Exports belong in the user's Videos folder, never inside the app bundle. */
const resolveWatchFolder = () => {
  if (process.env.MG_WATCH_FOLDER) return process.env.MG_WATCH_FOLDER;
  const folder = path.join(app.getPath("videos"), "Motion Graphics");
  if (!existsSync(folder)) mkdirSync(folder, { recursive: true });
  return folder;
};

/* ------------------------------------------------------------------ *
 * Window
 * ------------------------------------------------------------------ */

let mainWindow = null;
/** Resolved at boot; handed to the renderer so it can reach the right server. */
let apiPort = 3131;

const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: "#0d1117",
    autoHideMenuBar: true,
    // Don't show a white flash while the renderer boots.
    show: false,
    webPreferences: {
      preload: path.join(here, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      // Passed as an argv flag rather than over IPC so the renderer can read it
      // synchronously — the API base is needed before the first fetch, not
      // after an async round trip.
      additionalArguments: [`--api-port=${apiPort}`],
    },
  });

  mainWindow.once("ready-to-show", () => mainWindow.show());

  // External links open in the real browser, not inside the app window.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  if (isDev) {
    mainWindow.loadURL("http://localhost:5188");
  } else {
    mainWindow.loadFile(path.join(here, "..", "dist", "index.html"));
  }
};

/* ------------------------------------------------------------------ *
 * Updates
 * ------------------------------------------------------------------ */

const send = (channel, payload) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
};

const setupUpdates = () => {
  if (isDev) return;

  // Downloading is automatic; installing is not. An editor mid-export must not
  // have the app restart itself out from under them.
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("checking-for-update", () => send("update:status", { state: "checking" }));
  autoUpdater.on("update-available", (info) =>
    send("update:status", { state: "downloading", version: info.version }),
  );
  autoUpdater.on("update-not-available", () => send("update:status", { state: "current" }));
  autoUpdater.on("download-progress", (p) =>
    send("update:status", { state: "downloading", percent: Math.round(p.percent) }),
  );
  autoUpdater.on("update-downloaded", (info) =>
    send("update:status", { state: "ready", version: info.version }),
  );
  autoUpdater.on("error", (err) =>
    // Surfaced as one plain sentence. A failed update check must never look
    // like the app is broken — the editor can keep working regardless.
    send("update:status", { state: "error", message: String(err?.message ?? err) }),
  );

  autoUpdater.checkForUpdates().catch(() => {});

  /**
   * Check again daily.
   *
   * A launch-only check misses the common case: an editing machine that stays
   * open for a week. Failures are swallowed deliberately — a missed check must
   * never interrupt someone mid-edit, and the Sync button is always there.
   */
  const DAY = 24 * 60 * 60 * 1000;
  setInterval(() => autoUpdater.checkForUpdates().catch(() => {}), DAY);
};

/* ------------------------------------------------------------------ *
 * Boot
 * ------------------------------------------------------------------ */

// One instance only. Two render servers would fight over the same port.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    loadEnvironment();
    process.env.MG_WATCH_FOLDER = resolveWatchFolder();

    apiPort = await findFreePort(Number(process.env.MG_PORT ?? 3131));
    process.env.MG_PORT = String(apiPort);
    if (apiPort !== 3131) console.log(`[port] 3131 was taken, using ${apiPort}`);

    if (!isDev) {
      // Packaged: the engine is unpacked from the asar archive because
      // Remotion's bundler reads those files from disk directly.
      process.env.MG_ENGINE_ROOT = path.join(
        process.resourcesPath,
        "app.asar.unpacked",
        "engine",
      );
    }

    // Dynamic import so the environment above is already in place — see the
    // note on loadEnvironment().
    if (!isDev) {
      await import("../server/index.mjs");
    }

    createWindow();
    setupUpdates();
  });

  app.on("window-all-closed", () => app.quit());
}

/* ------------------------------------------------------------------ *
 * IPC
 * ------------------------------------------------------------------ */

ipcMain.handle("app:version", () => app.getVersion());

ipcMain.handle("update:check", async () => {
  if (isDev) return { state: "dev", message: "Updates are disabled in development." };
  try {
    const result = await autoUpdater.checkForUpdates();
    return { state: "checking", version: result?.updateInfo?.version ?? null };
  } catch (err) {
    return { state: "error", message: String(err?.message ?? err) };
  }
});

ipcMain.handle("update:install", () => {
  autoUpdater.quitAndInstall();
});

ipcMain.handle("shell:openFolder", (_event, folder) => shell.openPath(folder));
