/**
 * Note: When using the Node.JS APIs, this config file does NOT apply.
 * The Electron app (Phase 3) must pass `browserExecutable` explicitly to
 * @remotion/renderer — see resolveBrowser() below, which it should reuse.
 *
 * All configuration options: https://remotion.dev/docs/config
 */

import { existsSync } from "node:fs";
import { Config } from "@remotion/cli/config";

Config.setVideoImageFormat("jpeg");
Config.setOverwriteOutput(true);

/**
 * Remotion normally downloads its own Chrome Headless Shell on first render.
 * That download is served from Google Cloud Storage, which is geo-blocked in
 * some regions — it fails with a 403 "not available in your location", not a
 * network error, so it looks like a bug rather than a restriction.
 *
 * We therefore render with an already-installed Chromium instead. Every
 * Windows machine has Edge; most have Chrome. Override with the
 * REMOTION_BROWSER_EXECUTABLE env var if it lives somewhere unusual.
 */
export const BROWSER_CANDIDATES = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
];

export const resolveBrowser = (): string | null => {
  const override = process.env.REMOTION_BROWSER_EXECUTABLE;
  if (override && existsSync(override)) return override;
  return BROWSER_CANDIDATES.find((p) => existsSync(p)) ?? null;
};

const browser = resolveBrowser();
if (browser) {
  Config.setBrowserExecutable(browser);
}
