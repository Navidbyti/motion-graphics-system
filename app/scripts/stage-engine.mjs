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
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
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

execFileSync(
  isWindows ? "npm.cmd" : "npm",
  ["install", "--omit=dev", "--no-audit", "--no-fund", "--install-strategy=nested"],
  { cwd: STAGE, stdio: "inherit", env: cleanEnv, shell: isWindows },
);

console.log(`[stage] done → ${STAGE}`);
