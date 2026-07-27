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

import { spawnSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BrowserWindow, app, dialog, ipcMain, shell, utilityProcess } from "electron";
import electronUpdater from "electron-updater";

const { autoUpdater } = electronUpdater;
const here = path.dirname(fileURLToPath(import.meta.url));
const isDev = !app.isPackaged;

/**
 * Name the app before anything reads a path from it.
 *
 * `app.getPath("userData")` derives from package.json's `name`, which is "app"
 * — so settings, logs and the user's .env were landing in
 * AppData\Roaming\app. Generic enough to collide with another Electron app and
 * impossible to find when you need the log.
 */
app.setName("Motion Graphics");

/* ------------------------------------------------------------------ *
 * Logging
 * ------------------------------------------------------------------ */

/**
 * Log to a file, not just the console.
 *
 * A packaged app has no visible console, so when it failed to open a window on
 * someone else's machine there was nothing to inspect — the process was alive
 * and completely silent. Anything that can go wrong during boot has to leave a
 * trace somewhere a person can find it.
 */
let logPath = null;

const log = (...parts) => {
  const line = `[${new Date().toISOString()}] ${parts
    .map((p) => (p instanceof Error ? (p.stack ?? p.message) : String(p)))
    .join(" ")}`;
  console.log(line);
  try {
    if (!logPath) {
      const dir = path.join(app.getPath("userData"), "logs");
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      logPath = path.join(dir, "main.log");
    }
    appendFileSync(logPath, line + "\n");
  } catch {
    /* logging must never be the thing that breaks startup */
  }
};

// A rejected promise during boot previously vanished without trace.
process.on("unhandledRejection", (err) => log("[unhandledRejection]", err));
process.on("uncaughtException", (err) => log("[uncaughtException]", err));

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
      // Must match how the render server binds (server/index.mjs, 127.0.0.1).
      // A probe that tests a narrower address than the real bind reports free
      // for a port that is not, and the server then dies with EADDRINUSE the
      // moment it starts.
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
/** The express server, kept so shutdown can close its listening socket. */
let renderServer = null;
/** Set while an update is installing, so shutdown handlers stand down. */
let quittingForUpdate = false;

/**
 * Shut down hard and fast.
 *
 * The NSIS installer asks the app to close politely and aborts with "Motion
 * Graphics cannot be closed" if anything survives. Electron's helper processes
 * (GPU, utility) have no message loop and ignore a polite close outright — one
 * of them was refusing termination and blocking every update.
 *
 * So: release what we own, then call app.exit(), which terminates the whole
 * process tree immediately instead of negotiating with it. There is nothing to
 * save on the way out — exports are already written to disk, and the theme is
 * persisted as it's typed.
 */
const shutdownNow = () => {
  try {
    // A utility process exposes kill(); the dev path has no server at all.
    renderServer?.kill();
  } catch {
    /* already gone */
  }
  try {
    mainWindow?.destroy();
  } catch {
    /* already gone */
  }
  app.exit(0);
};

/**
 * Stop the render server and don't come back until it is actually gone.
 *
 * This exists because of how NSIS decides whether the app is running: it
 * matches on the executable *name*. Every Electron helper — GPU, renderer, and
 * our utility process — runs as "Motion Graphics.exe", so the render server is
 * indistinguishable from the app itself as far as the installer is concerned.
 * Firing the installer and killing the server 400ms later lost that race: the
 * installer checked first, found a live "Motion Graphics.exe", and aborted with
 * "Motion Graphics cannot be closed".
 *
 * A render also leaves headless Chrome behind, and those are grandchildren —
 * killing the utility process does not reap them on Windows, so the tree gets
 * killed explicitly.
 */
const stopRenderServer = async () => {
  const proc = renderServer;
  renderServer = null;
  if (!proc) return;

  const pid = proc.pid;

  await new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    proc.once("exit", finish);
    try {
      proc.kill();
    } catch {
      finish();
    }
    // Never block the update on a process that refuses to die — the tree kill
    // below is the backstop.
    setTimeout(finish, 2000);
  });

  if (process.platform === "win32" && pid) {
    try {
      spawnSync("taskkill", ["/pid", String(pid), "/T", "/F"], { windowsHide: true });
    } catch {
      /* already gone */
    }
  }
  log("[update] render server stopped");
};

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

  /**
   * Show the window even if the page never becomes ready.
   *
   * With `show: false`, the window only appears on `ready-to-show` — and that
   * event never fires if the renderer fails to load. The result is an invisible
   * app: a live process, no window, no error. An empty window the user can see
   * and report is strictly better than a hidden one.
   */
  const failsafe = setTimeout(() => {
    if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) {
      log("[window] ready-to-show never fired — showing anyway");
      mainWindow.show();
    }
  }, 4000);
  mainWindow.once("show", () => clearTimeout(failsafe));

  mainWindow.webContents.on("did-fail-load", (_e, code, desc, url) => {
    log(`[window] failed to load ${url}: ${desc} (${code})`);
    if (!mainWindow.isDestroyed()) mainWindow.show();
  });

  mainWindow.webContents.on("render-process-gone", (_e, details) => {
    log(`[window] renderer gone: ${details.reason}`);
  });

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

/**
 * Start the render server. Deliberately NOT awaited before the window opens.
 *
 * This used to run before `createWindow()`, and the server module has a
 * top-level await on the render service. When that import failed in the
 * packaged app the promise rejected, the window was never created, and nothing
 * was logged — the app appeared as a live process with no window and no error.
 *
 * The window now opens first no matter what, and a failure here becomes a
 * message the editor can read and send on.
 */
const startRenderServer = () => {
  if (isDev) return;
  try {
    // The app ships unarchived (build.asar = false), so the engine is simply a
    // folder under resources — no asar path translation involved.
    const engineRoot = path.join(process.resourcesPath, "engine");
    log(`[server] engine root: ${engineRoot} (exists: ${existsSync(engineRoot)})`);

    /**
     * The server runs in a utility process, NOT in the main process.
     *
     * Importing it here loaded Remotion's bundler on the main thread, and
     * module evaluation is synchronous — it blocked for ~17 seconds on a fast
     * machine and considerably longer on a slow one. During that block the
     * window can't paint and `ready-to-show` can't be delivered, so the app was
     * simply invisible for the whole time. That's what "clicking it does
     * nothing" was.
     *
     * `utilityProcess` also solves the reason the import was in-process to
     * begin with: Electron owns the child's lifetime, so it can't outlive the
     * app the way a bare spawned process could.
     */
    renderServer = utilityProcess.fork(path.join(here, "..", "server", "index.mjs"), [], {
      env: {
        ...process.env,
        MG_ENGINE_ROOT: engineRoot,
        MG_PORT: String(apiPort),
        /*
          Transcription downloads a binary and a model of up to 1.6 GB. They go
          in userData, not beside the app: the install directory is wiped and
          rewritten by every update, which would re-download the model each
          time, and on some machines it isn't writable at all.
        */
        MG_WHISPER_DIR: path.join(app.getPath("userData"), "whisper"),
      },
      stdio: "pipe",
    });

    renderServer.stdout?.on("data", (d) => log(`[server] ${String(d).trim()}`));
    renderServer.stderr?.on("data", (d) => log(`[server:err] ${String(d).trim()}`));

    renderServer.on("spawn", () => {
      log(`[server] process spawned, warming on port ${apiPort}`);
      send("server:status", { ok: true, port: apiPort });
    });

    renderServer.on("exit", (code) => {
      log(`[server] exited with code ${code}`);
      if (code !== 0) {
        send("server:status", {
          ok: false,
          message: "The render engine stopped. Restart the app to try again.",
        });
      }
    });
  } catch (err) {
    log("[server] FAILED to start", err);
    send("server:status", {
      ok: false,
      message: `The render engine didn't start: ${String(err?.message ?? err)}`,
    });
  }
};

  app.whenReady().then(async () => {
    log(`[boot] version ${app.getVersion()} packaged=${app.isPackaged}`);
    loadEnvironment();

    try {
      process.env.MG_WATCH_FOLDER = resolveWatchFolder();
    } catch (err) {
      log("[boot] could not create watch folder", err);
    }

    try {
      apiPort = await findFreePort(Number(process.env.MG_PORT ?? 3131));
    } catch (err) {
      log("[boot] port probe failed, falling back to 3131", err);
      apiPort = 3131;
    }
    process.env.MG_PORT = String(apiPort);
    log(`[boot] api port ${apiPort}`);

    // Window FIRST. Everything after this can fail visibly instead of silently.
    createWindow();
    setupUpdates();
    startRenderServer();
  });

  // Closing the window closes the app — and closes it *hard*, so a stale
  // helper process can never block a later install.
  /*
    Closing the window closes the app — and closes it *hard*, so a stale helper
    process can never block a later install.

    The exception is an update in flight. electron-updater closes the window as
    part of `quitAndInstall`, and exiting the process at that moment kills it
    before it has spawned the installer: the app simply disappears and nothing
    installs. While the flag is set, shutdown is electron-updater's job.
  */
  app.on("window-all-closed", () => {
    if (quittingForUpdate) {
      log("[update] window closed by the updater — leaving shutdown to it");
      return;
    }
    shutdownNow();
  });
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

ipcMain.handle("update:install", async () => {
  /**
   * Two things have to be true here, and satisfying the first broke the second.
   *
   * The render server must be gone before the installer runs: every Electron
   * helper shares the executable name, so NSIS cannot tell our utility process
   * from the app itself and aborts with "Motion Graphics cannot be closed".
   *
   * But the app must NOT actually exit until `quitAndInstall` has spawned the
   * installer. The previous version destroyed the window as part of that
   * cleanup — which closed the last window, fired `window-all-closed`, and ran
   * `shutdownNow()` → `app.exit(0)` before `quitAndInstall` was ever reached.
   * The app closed and no installer appeared. Own cleanup racing own shutdown.
   *
   * So: flag the intent first, stop the server, and let electron-updater close
   * the window itself. `window-all-closed` stands down while the flag is set.
   */
  quittingForUpdate = true;

  try {
    await stopRenderServer();
  } catch (err) {
    log("[update] could not stop the render server", err);
  }

  log("[update] launching installer");
  try {
    autoUpdater.quitAndInstall(false, true);
  } catch (err) {
    // Put the app back in a usable state rather than leaving it a zombie that
    // won't close normally either.
    quittingForUpdate = false;
    log("[update] quitAndInstall threw", err);
    return { ok: false, message: String(err?.message ?? err) };
  }

  /*
    Failsafe, and deliberately generous. The installer is spawned detached by
    the call above, so exiting afterwards cannot interrupt it — but exiting too
    eagerly can beat it to the spawn, which is the exact bug this handler had.
  */
  setTimeout(() => app.exit(0), 8000);
  return { ok: true };
});

ipcMain.handle("shell:openFolder", (_event, folder) => shell.openPath(folder));

/**
 * Native picker, because the renderer only ever sees a File object with no
 * path. The transcriber runs in a separate process and needs a real path on
 * disk — copying a multi-gigabyte video through the browser to get one would be
 * absurd.
 */
ipcMain.handle("dialog:pickMedia", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "Choose a video or audio file",
    properties: ["openFile"],
    filters: [
      {
        name: "Video and audio",
        extensions: ["mp4", "mov", "mkv", "avi", "webm", "m4v", "mp3", "wav", "m4a", "flac", "ogg", "aac"],
      },
      { name: "All files", extensions: ["*"] },
    ],
  });
  return result.canceled ? null : result.filePaths[0];
});

/**
 * The manual path, for when the updater cannot reach GitHub at all — a blocked
 * or filtered connection is not something the app can fix, and "Sync failed"
 * with no way forward is a dead end.
 */
ipcMain.handle("shell:openReleases", () =>
  shell.openExternal("https://github.com/Navidbyti/motion-graphics-system/releases/latest"),
);
