/**
 * RENDER SERVER
 *
 * The only part of the app that touches Remotion's Node APIs. The UI never
 * renders anything itself — it previews with <Player> (which runs the same React
 * components in the browser) and posts here for real output.
 *
 * Kept as a separate process from the UI on purpose: rendering pins a CPU for
 * tens of seconds, and doing it in the UI process would freeze the window.
 */

import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { pathToFileURL } from "node:url";
import { proxyInUse } from "./http.mjs";
import { ASSETS, TIMEFRAMES, fetchMarketSeries } from "./market.mjs";
import { LANGUAGES, MODELS, transcribe, whisperStatus } from "./whisper.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(here, "..", "..");

/**
 * Environment comes from `node --env-file-if-exists=../.env` in the npm script
 * (and from Electron's main process when packaged), never from a loadEnvFile()
 * call here. ES module imports are fully evaluated before the importing
 * module's body runs, so http.mjs would read process.env before any load on
 * this line could take effect.
 */

/**
 * The render service is imported dynamically, by absolute path.
 *
 * A static relative import breaks in the packaged app: `server/` lives inside
 * app.asar while `engine/` is unpacked beside it, so "../../engine/..." points
 * at a directory that doesn't exist. It works perfectly in dev, which is why
 * this only surfaced when the first real .exe was launched.
 */
const ENGINE_ROOT =
  process.env.MG_ENGINE_ROOT ?? path.resolve(here, "..", "..", "engine");

const { PRESETS, getBundle, renderTemplate, renderThumbnail, resolveBrowser } =
  await import(
    pathToFileURL(path.join(ENGINE_ROOT, "scripts", "render-service.mjs")).href
  );

const WATCH_FOLDER =
  process.env.MG_WATCH_FOLDER ?? path.join(PROJECT_ROOT, "exports");
const THUMB_FOLDER = path.join(PROJECT_ROOT, ".thumbnails");

for (const dir of [WATCH_FOLDER, THUMB_FOLDER]) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

const app = express();
app.use(express.json({ limit: "5mb" }));

/** Simple in-memory job table. One editor, one machine — no queue needed yet. */
const jobs = new Map();
let nextJobId = 1;

const safeName = (s) => s.replace(/[^a-z0-9-_]+/gi, "-").replace(/^-+|-+$/g, "");

app.get("/api/health", (_req, res) => {
  const browser = resolveBrowser();
  res.json({
    ok: Boolean(browser),
    browser,
    watchFolder: WATCH_FOLDER,
    presets: Object.entries(PRESETS).map(([id, p]) => ({
      id,
      label: p.label,
      extension: p.extension,
    })),
    // Surfaced so the UI can show one plain sentence rather than a stack trace.
    problem: browser
      ? null
      : "No Chrome or Edge found. The renderer needs an installed browser.",
  });
});

/* ---------------- transcription ---------------- */

app.get("/api/whisper/status", (_req, res) => {
  res.json({ ...whisperStatus(), models: MODELS, languages: LANGUAGES, installed: whisperStatus().models });
});

app.post("/api/whisper/transcribe", async (req, res) => {
  const { source, model, language, fps } = req.body ?? {};

  /*
    Runs as a job rather than a request. A 20-minute interview on the Medium
    model takes several minutes, and an HTTP request held open that long dies to
    a proxy or a timeout somewhere in between — with the work already done and
    no way to report it.
  */
  const id = String(nextJobId++);
  jobs.set(id, { id, status: "working", stage: "starting", percent: null });

  res.json({ id });

  try {
    const result = await transcribe({
      source,
      model,
      language,
      fps: Number(fps) || 30,
      outputDir: path.join(WATCH_FOLDER, "Subtitles"),
      onProgress: (p) =>
        jobs.set(id, { ...jobs.get(id), status: "working", ...p }),
    });
    jobs.set(id, { id, status: "done", ...result });
  } catch (err) {
    jobs.set(id, { id, status: "error", error: String(err?.message ?? err) });
  }
});

/* ---------------- market data ---------------- */

app.get("/api/market/assets", (_req, res) => {
  res.json({
    assets: ASSETS.map(({ id, label, source }) => ({ id, label, source })),
    timeframes: TIMEFRAMES,
  });
});

app.post("/api/market/series", async (req, res) => {
  try {
    res.json(await fetchMarketSeries(req.body ?? {}));
  } catch (err) {
    /*
      502, not 500: the failure is upstream, and the message is written to be
      read by the editor rather than by us. There is deliberately no fallback
      series here — see market.mjs.
    */
    res.status(502).json({ error: String(err?.message ?? err) });
  }
});

app.post("/api/thumbnail", async (req, res) => {
  const { compositionId, inputProps = {} } = req.body ?? {};
  try {
    const output = path.join(THUMB_FOLDER, `${safeName(compositionId)}.png`);
    await renderThumbnail({ compositionId, inputProps, outputPath: output });
    res.sendFile(output);
  } catch (err) {
    res.status(500).json({ error: String(err?.message ?? err) });
  }
});

app.post("/api/export", async (req, res) => {
  const { compositionId, inputProps = {}, preset = "overlay", name } = req.body ?? {};
  const config = PRESETS[preset];
  if (!config) return res.status(400).json({ error: `Unknown preset "${preset}"` });

  const jobId = String(nextJobId++);
  const base = safeName(name || compositionId);
  // Timestamped so a re-export never silently overwrites a file the editor has
  // already cut into a timeline.
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const outputPath = path.join(WATCH_FOLDER, `${base}-${stamp}.${config.extension}`);

  jobs.set(jobId, { status: "rendering", progress: 0, outputPath });
  res.json({ jobId, outputPath });

  try {
    await renderTemplate({
      compositionId,
      inputProps,
      preset,
      outputPath,
      onProgress: (progress) => {
        const job = jobs.get(jobId);
        if (job) job.progress = progress;
      },
    });
    jobs.set(jobId, { status: "done", progress: 1, outputPath });
  } catch (err) {
    jobs.set(jobId, {
      status: "failed",
      progress: 0,
      outputPath,
      error: String(err?.message ?? err),
    });
  }
});

app.get("/api/job/:id", (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: "No such job" });
  res.json(job);
});

const PORT = process.env.MG_PORT ?? 3131;

/**
 * Exported so Electron can close it during shutdown. A listening socket keeps
 * handles open, and the NSIS installer refuses to run while any part of the app
 * is still alive.
 */
/**
 * Bound to the loopback address explicitly, for two reasons.
 *
 * Security: this API renders files and writes them to disk. `app.listen(port)`
 * binds every interface, which puts that on the local network — anyone on the
 * same café Wi-Fi could drive it. Nothing outside this machine has any business
 * reaching it.
 *
 * Correctness: Electron probes for a free port before starting this process,
 * and it probes 127.0.0.1. Binding a wider address than the probe checked means
 * the probe can pass while the bind fails with EADDRINUSE — the app then boots
 * with no render server and no explanation. That happened: another process held
 * the port on the wildcard address, the probe on 127.0.0.1 succeeded, and the
 * server died a second later. Probe and bind must agree.
 */
export const server = app.listen(PORT, "127.0.0.1", async () => {
  console.log(`render server  http://127.0.0.1:${PORT}`);
  console.log(`watch folder   ${WATCH_FOLDER}`);
  console.log(`browser        ${resolveBrowser() ?? "NONE FOUND"}`);
  console.log(`proxy          ${proxyInUse ?? "direct (no HTTPS_PROXY set)"}`);
  // Warm the bundle at startup so the editor's first export isn't 10s slower
  // than every subsequent one for no visible reason.
  console.log("warming bundle…");
  await getBundle();
  console.log("ready");
});
