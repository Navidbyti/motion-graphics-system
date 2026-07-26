/**
 * RENDER SERVICE — the path the Electron app will use.
 *
 * This is deliberately NOT the Remotion CLI. The app renders from a Node
 * process via @remotion/bundler + @remotion/renderer, and `remotion.config.ts`
 * does **not** apply to those APIs. Everything the config file does for CLI
 * renders has to be passed explicitly here — most importantly
 * `browserExecutable`, because Remotion's own Chrome download is geo-blocked
 * (403) from this location and would otherwise crash on first render.
 *
 * Run directly to spike it:
 *   node scripts/render-service.mjs CandleChart-Vertical out/service-test.mov overlay
 */

import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { bundle } from "@remotion/bundler";
import { renderMedia, renderStill, selectComposition } from "@remotion/renderer";

const here = path.dirname(fileURLToPath(import.meta.url));

/**
 * In a packaged app the engine is unpacked out of the asar archive (Remotion's
 * bundler reads these files from disk, which it cannot do inside an archive),
 * so its location differs from the module's own path. Electron sets this.
 */
const ENGINE_ROOT = process.env.MG_ENGINE_ROOT ?? path.resolve(here, "..");

/** Kept in sync with BROWSER_CANDIDATES in remotion.config.ts. */
const BROWSER_CANDIDATES = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
];

export const resolveBrowser = () => {
  const override = process.env.REMOTION_BROWSER_EXECUTABLE;
  if (override && existsSync(override)) return override;
  return BROWSER_CANDIDATES.find((p) => existsSync(p)) ?? null;
};

/**
 * Export presets. The editor sees these three names and nothing else.
 * `overlay` is the default: ProRes 4444 with a real alpha channel, which is what
 * drops onto a Premiere timeline over footage.
 */
export const PRESETS = {
  overlay: {
    label: "Overlay (transparent)",
    extension: "mov",
    codec: "prores",
    proResProfile: "4444",
    pixelFormat: "yuva444p10le",
    imageFormat: "png",
  },
  fullframe: {
    label: "Full-frame MP4",
    extension: "mp4",
    codec: "h264",
    pixelFormat: "yuv420p",
    imageFormat: "jpeg",
  },
  social: {
    label: "Social vertical",
    extension: "mp4",
    codec: "h264",
    pixelFormat: "yuv420p",
    imageFormat: "jpeg",
  },
};

let cachedBundle = null;

/**
 * Bundling is the slow part (~10s). The app bundles once at startup and reuses
 * the URL for every preview, thumbnail and export in the session.
 */
export const getBundle = async (onProgress) => {
  if (cachedBundle) return cachedBundle;
  cachedBundle = await bundle({
    entryPoint: path.join(ENGINE_ROOT, "src", "index.ts"),
    onProgress,
  });
  return cachedBundle;
};

export const renderTemplate = async ({
  compositionId,
  outputPath,
  inputProps = {},
  preset = "overlay",
  onProgress,
}) => {
  const browserExecutable = resolveBrowser();
  if (!browserExecutable) {
    throw new Error(
      "No Chrome or Edge found. Remotion cannot download its own browser here " +
        "(Google's storage is geo-blocked), so an installed Chromium is required. " +
        "Set REMOTION_BROWSER_EXECUTABLE to override.",
    );
  }

  const serveUrl = await getBundle();
  const p = PRESETS[preset];

  const composition = await selectComposition({
    serveUrl,
    id: compositionId,
    inputProps,
    browserExecutable,
  });

  await renderMedia({
    composition,
    serveUrl,
    codec: p.codec,
    proResProfile: p.proResProfile,
    pixelFormat: p.pixelFormat,
    imageFormat: p.imageFormat,
    outputLocation: outputPath,
    inputProps,
    browserExecutable,
    onProgress: onProgress
      ? ({ progress }) => onProgress(progress)
      : undefined,
  });

  return { outputPath, durationInFrames: composition.durationInFrames };
};

/** Library thumbnails. Cheap enough to regenerate whenever props change. */
export const renderThumbnail = async ({
  compositionId,
  outputPath,
  inputProps = {},
  frame,
}) => {
  const browserExecutable = resolveBrowser();
  const serveUrl = await getBundle();
  const composition = await selectComposition({
    serveUrl,
    id: compositionId,
    inputProps,
    browserExecutable,
  });

  await renderStill({
    composition,
    serveUrl,
    output: outputPath,
    inputProps,
    browserExecutable,
    // Default to a frame late enough that entrances have settled — a thumbnail
    // of frame 0 is an empty card.
    frame: frame ?? Math.floor(composition.durationInFrames * 0.75),
  });

  return outputPath;
};

/* ------------------------------------------------------------------ *
 * CLI entry, for spiking
 * ------------------------------------------------------------------ */

const isDirectRun = process.argv[1] === fileURLToPath(import.meta.url);

if (isDirectRun) {
  const [compositionId, outputPath, preset = "overlay"] = process.argv.slice(2);

  if (!compositionId || !outputPath) {
    console.error("usage: node scripts/render-service.mjs <compositionId> <output> [preset]");
    process.exit(1);
  }

  const browser = resolveBrowser();
  console.log(`browser:  ${browser ?? "NONE FOUND"}`);
  console.log(`preset:   ${preset} (${PRESETS[preset]?.label})`);

  const started = Date.now();
  console.log("bundling…");
  await getBundle(() => {});
  console.log(`bundled in ${((Date.now() - started) / 1000).toFixed(1)}s`);

  let lastLogged = -1;
  const result = await renderTemplate({
    compositionId,
    outputPath: path.resolve(ENGINE_ROOT, outputPath),
    preset,
    onProgress: (progress) => {
      const pct = Math.round(progress * 100);
      if (pct >= lastLogged + 25) {
        lastLogged = pct;
        console.log(`  ${pct}%`);
      }
    },
  });

  console.log(
    `done in ${((Date.now() - started) / 1000).toFixed(1)}s → ${result.outputPath}`,
  );
}
