/**
 * Stage a self-contained copy of the engine for packaging.
 *
 * The repo uses npm workspaces, which hoists shared dependencies (`remotion`,
 * `react`, …) to the ROOT node_modules. That's ideal for development and fatal
 * for packaging: electron-builder copies `engine/node_modules`, whose contents
 * then try to `require('remotion')` and find nothing, because it lives two
 * directories up in a folder that was never shipped.
 *
 * So before packaging we copy the engine's source to build/engine and run a
 * plain, non-workspace, production-only install there. The result is a normal
 * flat package that works wherever it's dropped.
 *
 * Run automatically by `npm run pack` / `npm run release`.
 */

import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(here, "..");
const REPO_ROOT = path.resolve(APP_ROOT, "..");
const SOURCE = path.join(REPO_ROOT, "engine");
const STAGE = path.join(APP_ROOT, "build", "engine");

const SKIP = new Set(["node_modules", "out", ".git", ".turbo"]);

console.log("[stage] copying engine source…");
rmSync(STAGE, { recursive: true, force: true });
mkdirSync(STAGE, { recursive: true });

cpSync(SOURCE, STAGE, {
  recursive: true,
  filter: (src) => {
    const rel = path.relative(SOURCE, src);
    if (!rel) return true;
    return !rel.split(path.sep).some((segment) => SKIP.has(segment));
  },
});

/**
 * Drop the lockfile and install fresh. The root lockfile describes a hoisted
 * workspace layout that cannot be reproduced standalone, and reusing it here
 * reintroduces exactly the resolution failure we're trying to avoid.
 */
const stagedLock = path.join(STAGE, "package-lock.json");
if (existsSync(stagedLock)) rmSync(stagedLock);

// Belt and braces: make sure npm cannot treat this copy as part of the
// workspace it was lifted out of.
writeFileSync(path.join(STAGE, ".npmrc"), "workspaces=false\npackage-lock=false\n");

console.log("[stage] installing production dependencies (this takes a minute)…");

/**
 * Strip inherited npm_* variables before spawning.
 *
 * This script is itself run via `npm run`, which exports the *outer* invocation's
 * context — including `npm_config_workspace` and friends. The child npm then
 * believes it is still operating on the app workspace, and the install fails
 * with a confusing "workspace app@0.1.0" error while the same command run by
 * hand succeeds.
 */
const cleanEnv = Object.fromEntries(
  Object.entries(process.env).filter(([key]) => !key.toLowerCase().startsWith("npm_")),
);

/**
 * `shell: true` on Windows is required, not cosmetic.
 *
 * Node blocks spawning .cmd/.bat files directly (a 2024 command-injection fix),
 * so `execFileSync("npm.cmd", …)` fails with EINVAL. Running the same command
 * by hand works, which makes this look like a workspace problem rather than a
 * spawn problem.
 */
const isWindows = process.platform === "win32";

/**
 * HOISTED, not nested — and this is a correctness issue on Windows, not a
 * preference.
 *
 * `--install-strategy=nested` is npm's legacy layout: every dependency lives
 * inside its parent rather than being flattened, which manufactures chains like
 *
 *   engine/node_modules/@remotion/cli/node_modules/@remotion/studio-server
 *     /node_modules/@svgr/plugin-jsx/node_modules/@babel/core/node_modules/...
 *
 * Under the install root that lands at 259 characters, and Windows' MAX_PATH is
 * 260. The files copy in fine — but NSIS cannot delete them, so *every
 * subsequent install fails at the uninstall-old-files step*, with exit code 2
 * and "Failed to uninstall old application files". The app was effectively
 * un-upgradable, and nothing about the message points at path length.
 *
 * Hoisting is also the default, so this is a return to normal behaviour rather
 * than a trick. The standalone install here hoists into the staged engine's own
 * node_modules, which is exactly what the packaged app needs.
 */
execFileSync(
  isWindows ? "npm.cmd" : "npm",
  ["install", "--omit=dev", "--no-audit", "--no-fund"],
  { cwd: STAGE, stdio: "inherit", env: cleanEnv, shell: isWindows },
);

/**
 * Guard the invariant rather than trusting it.
 *
 * A future dependency bump can reintroduce a deep chain, and the symptom
 * appears one release later on someone else's machine as a failed upgrade. Fail
 * the build here instead, where the cause is obvious.
 */
const INSTALL_ROOT_ALLOWANCE = 46; // "C:\Users\<name>\AppData\Local\Programs\Motion Graphics"
const MAX_PATH = 260;
const longest = [];

const walk = (dir, depth = 0) => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, depth + 1);
    else {
      const projected =
        INSTALL_ROOT_ALLOWANCE + path.relative(STAGE, full).length + "\\resources\\engine\\".length;
      if (projected > MAX_PATH - 10) longest.push([projected, path.relative(STAGE, full)]);
    }
  }
};

walk(STAGE);

if (longest.length) {
  longest.sort((a, b) => b[0] - a[0]);
  console.error(
    `\n[stage] ${longest.length} file(s) would exceed Windows' MAX_PATH once installed.\n` +
      `Longest (${longest[0][0]} chars):\n  ${longest[0][1]}\n\n` +
      `This makes the app impossible to upgrade — NSIS cannot delete these files.\n` +
      `Fix by removing the offending dependency from engine/package.json's\n` +
      `"dependencies" (dev-only tools belong in devDependencies).\n`,
  );
  process.exit(1);
}

console.log(`[stage] done → ${STAGE}`);
