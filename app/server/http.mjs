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

const attempt = async (url, options, useProxy) => {
  try {
    return await undiciFetch(url, {
      ...options,
      ...(useProxy && dispatcher ? { dispatcher } : {}),
      /*
        A caller-supplied signal wins.

        This default is a TOTAL time limit, which is right for an API call and
        wrong for a download: it kills the transfer 45 seconds in regardless of
        how healthy it is, so a 466 MB model could never finish. Anything
        fetching a large body passes its own signal — typically one that fires
        on inactivity rather than on elapsed time. Note this must come after the
        options spread, or the default would silently override the caller's.
      */
      signal: options.signal ?? AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    if (err?.name === "TimeoutError" || err?.name === "AbortError") {
      throw new Error(
        `Request timed out after ${TIMEOUT_MS / 1000}s` +
          (useProxy && proxyUrl ? ` (via proxy ${proxyUrl})` : ""),
      );
    }
    throw err;
  }
};

export const httpFetch = (url, options = {}) => attempt(url, options, true);

/** Straight out, ignoring any configured proxy. */
export const httpFetchDirect = (url, options = {}) => attempt(url, options, false);

/** True when a proxy is configured and therefore worth falling back to. */
export const hasProxy = Boolean(dispatcher);

/**
 * For hosts that are NOT geo-blocked: go direct, fall back to the proxy.
 *
 * The proxy exists for services this machine can't otherwise reach. Market data
 * isn't one of them, and routing it through a local proxy that is occasionally
 * down turns a working request into "fetch failed" — which is exactly what
 * happened during testing: the direct call succeeded while the proxied one
 * didn't. Trying direct first also keeps working on a machine where Yahoo IS
 * blocked, because the proxy attempt still follows.
 */
export const httpFetchDirectFirst = async (url, options = {}) => {
  try {
    return await attempt(url, options, false);
  } catch (directError) {
    if (!dispatcher) throw directError;
    try {
      return await attempt(url, options, true);
    } catch {
      // Report the direct failure: it's the one that describes the network the
      // user is actually on.
      throw directError;
    }
  }
};
