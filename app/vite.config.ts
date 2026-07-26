import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const here = path.dirname(fileURLToPath(import.meta.url));
const ENGINE_SRC = path.resolve(here, "..", "engine", "src");

export default defineConfig({
  plugins: [react()],
  /*
   * Serve the ENGINE's public folder, not one of our own.
   *
   * Templates reference fonts and logos via Remotion's `staticFile()`, which
   * resolves against engine/public. If Vite served a different directory the
   * preview would 404 those assets and silently fall back to system fonts —
   * the preview would then disagree with the export, which is the one thing
   * this architecture is supposed to make impossible.
   */
  publicDir: path.resolve(here, "..", "engine", "public"),
  resolve: {
    alias: {
      // The UI imports the real template components and schemas straight from
      // the engine source. <Player> then runs the exact same React code the
      // renderer will — so the preview can't drift from the export.
      "@engine": ENGINE_SRC,
    },
  },
  server: {
    port: 5188,
    fs: { allow: [path.resolve(here, "..")] },
    proxy: { "/api": "http://localhost:3131" },
  },
});
