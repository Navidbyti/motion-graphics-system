/**
 * Where the render server lives.
 *
 * In dev the UI is served by Vite, which proxies /api to the server. In the
 * packaged app the UI loads from a file:// URL, where a relative "/api/…"
 * resolves against the filesystem root and every request fails. The Library
 * still renders — templates are bundled — so the app looks completely fine
 * right up until someone tries to export.
 *
 * Lives in its own module so anything that talks to the server can import it
 * without reaching into App.tsx.
 */

const bridge = (window as unknown as { desktop?: { apiPort?: number } }).desktop;

export const isDesktopApp = Boolean(bridge);

// The port is resolved at boot — 3131 may already be taken on this machine.
export const API_BASE = `http://localhost:${bridge?.apiPort ?? 3131}`;

export const api = (path: string) => (isDesktopApp ? API_BASE + path : path);

/**
 * GET something from the render server, waiting for the server to exist.
 *
 * The window opens in a second or two; the render server takes about thirteen.
 * Every screen that fetched once on mount therefore had a race it usually lost,
 * and each one reported the loss differently — an empty Export dropdown here,
 * "Couldn't reach the render server" there — with no retry anywhere. Fixing
 * them individually just moved the bug to whichever screen was written next, so
 * the retry lives in one place that all of them use.
 *
 * Gives up eventually: a server that is still absent after a minute is broken
 * rather than slow, and saying so beats spinning forever.
 */
export const getWhenReady = async <T>(
  path: string,
  { attempts = 50, delayMs = 1200 }: { attempts?: number; delayMs?: number } = {},
): Promise<T> => {
  let lastError: unknown = null;

  for (let i = 0; i < attempts; i++) {
    try {
      const response = await fetch(api(path));
      if (response.ok) return (await response.json()) as T;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (err) {
      lastError = err;
    }
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  throw new Error(
    `The render engine didn't start. ${String(
      (lastError as Error)?.message ?? lastError ?? "",
    )}`.trim(),
  );
};
