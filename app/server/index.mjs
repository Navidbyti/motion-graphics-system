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

app.listen(PORT, async () => {
  console.log(`render server  http://localhost:${PORT}`);
  console.log(`watch folder   ${WATCH_FOLDER}`);
  console.log(`browser        ${resolveBrowser() ?? "NONE FOUND"}`);
  console.log(`proxy          ${proxyInUse ?? "direct (no HTTPS_PROXY set)"}`);
  // Warm the bundle at startup so the editor's first export isn't 10s slower
  // than every subsequent one for no visible reason.
  console.log("warming bundle…");
  await getBundle();
  console.log("ready");
});
