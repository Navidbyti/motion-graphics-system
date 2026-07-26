/**
 * Outbound HTTP that honours the system proxy.
 *
 * Node's global `fetch` ignores HTTP_PROXY / HTTPS_PROXY entirely — unlike
 * curl, git, and almost everything else. On a machine that reaches Google only
 * through a local proxy (which is this one: Google's APIs are geo-blocked here,
 * the same block that stops Remotion downloading its Chrome), that difference
 * is invisible and brutal: curl succeeds, the app gets a 403 HTML error page
 * that looks like a rejected API key rather than a routing problem.
 *
 * Every outbound request from the server must go through this.
 */

import { ProxyAgent, fetch as undiciFetch } from "undici";

const proxyUrl =
  process.env.HTTPS_PROXY ??
  process.env.https_proxy ??
  process.env.HTTP_PROXY ??
  process.env.http_proxy ??
  null;

const dispatcher = proxyUrl ? new ProxyAgent(proxyUrl) : undefined;

/** Reported at startup so a proxy misconfiguration is visible, not mysterious. */
export const proxyInUse = proxyUrl;

/**
 * Hard timeout. Without one, a stalled proxy leaves the request hanging
 * indefinitely and the editor watching "Working…" with no way to tell whether
 * it's thinking or dead. A clear failure he can retry beats an infinite wait.
 */
const TIMEOUT_MS = Number(process.env.MG_HTTP_TIMEOUT_MS ?? 45_000);

export const httpFetch = async (url, options = {}) => {
  try {
    return await undiciFetch(url, {
      ...options,
      ...(dispatcher ? { dispatcher } : {}),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    if (err?.name === "TimeoutError" || err?.name === "AbortError") {
      throw new Error(
        `Request timed out after ${TIMEOUT_MS / 1000}s` +
          (proxyUrl ? ` (via proxy ${proxyUrl})` : ""),
      );
    }
    throw err;
  }
};
