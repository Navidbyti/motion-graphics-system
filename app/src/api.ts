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
