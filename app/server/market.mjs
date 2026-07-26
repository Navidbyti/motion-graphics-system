/**
 * MARKET DATA
 *
 * Fetches real OHLC series so the charts can fill themselves instead of being
 * typed in by hand.
 *
 * TWO RULES, AND THEY ARE THE POINT:
 *
 * 1. There is no simulated fallback. If a provider is unreachable, blocked, or
 *    returns nothing, this throws and the editor sees why. The obvious
 *    convenience — quietly substituting a plausible random walk — would put
 *    invented prices on a chart captioned with a real ticker and publish it to
 *    an audience taking financial cues from it. A missing chart is a delay; a
 *    fabricated one is a false claim about a real market.
 *
 * 2. It runs on the server, not in the renderer. Browser requests to Yahoo are
 *    blocked by CORS, which is why the standalone page had to bounce through a
 *    third-party relay. Here there is no CORS and no relay — and requests go
 *    through httpFetchDirectFirst, so a machine that only reaches the host
 *    through a local proxy still works.
 *
 * ONE PROVIDER, DELIBERATELY. The first cut also used Binance for crypto, which
 * returns HTTP 451 (unavailable for legal reasons) from this region — a hard
 * geo-block, not a transient failure. Yahoo carries BTC-USD, ETH-USD and
 * SOL-USD with the same intervals, so the second provider bought nothing but an
 * extra way to fail.
 */

import { httpFetchDirectFirst } from "./http.mjs";

/**
 * What the editor can pick. Deliberately a fixed list rather than a free-text
 * symbol box: a typo in a ticker returns an empty series and looks like a bug,
 * and these are the instruments the three brands actually talk about.
 */
export const ASSETS = [
  { id: "EURUSD", label: "EUR/USD", symbol: "EURUSD=X", decimals: 5 },
  { id: "GBPUSD", label: "GBP/USD", symbol: "GBPUSD=X", decimals: 5 },
  { id: "USDJPY", label: "USD/JPY", symbol: "JPY=X", decimals: 3 },
  { id: "XAUUSD", label: "Gold (XAU/USD)", symbol: "GC=F", decimals: 2 },
  { id: "BTCUSD", label: "BTC/USD", symbol: "BTC-USD", decimals: 2 },
  { id: "ETHUSD", label: "ETH/USD", symbol: "ETH-USD", decimals: 2 },
  { id: "SOLUSD", label: "SOL/USD", symbol: "SOL-USD", decimals: 2 },
  { id: "NASDAQ", label: "NASDAQ-100", symbol: "^NDX", decimals: 2 },
  { id: "SP500", label: "S&P 500", symbol: "^GSPC", decimals: 2 },
  { id: "DOW", label: "Dow Jones", symbol: "^DJI", decimals: 2 },
  { id: "AAPL", label: "Apple", symbol: "AAPL", decimals: 2 },
  { id: "TSLA", label: "Tesla", symbol: "TSLA", decimals: 2 },
  { id: "NVDA", label: "NVIDIA", symbol: "NVDA", decimals: 2 },
];

/** Only intervals Yahoo actually serves — 4h isn't one of them. */
export const TIMEFRAMES = [
  { id: "5m", label: "5 minutes" },
  { id: "15m", label: "15 minutes" },
  { id: "1h", label: "1 hour" },
  { id: "1d", label: "1 day" },
  { id: "1wk", label: "1 week" },
];

const getAsset = (id) => {
  const asset = ASSETS.find((a) => a.id === id);
  if (!asset) throw new Error(`Unknown asset "${id}".`);
  return asset;
};

/* ------------------------------------------------------------------ *
 * Yahoo — forex, crypto, indices, equities
 * ------------------------------------------------------------------ */

const YAHOO_INTERVAL = {
  "5m": "5m",
  "15m": "15m",
  "1h": "60m",
  "1d": "1d",
  "1wk": "1wk",
};

/**
 * Yahoo caps history per interval — intraday data simply isn't available far
 * back, and asking for more than it allows returns an error rather than less
 * data. Pick the smallest range that covers what was asked for.
 */
const yahooRange = (interval, limit) => {
  if (interval === "5m" || interval === "15m") {
    const days = Math.ceil((limit * (interval === "5m" ? 5 : 15)) / (60 * 7)) + 2;
    return days <= 7 ? "7d" : "60d"; // 60d is Yahoo's intraday ceiling
  }
  if (interval === "60m") return limit <= 350 ? "1mo" : "2y";
  if (interval === "1wk") return limit <= 260 ? "5y" : "10y";
  // Daily: ~252 trading days a year.
  const years = Math.ceil(limit / 252) + 1;
  return years <= 1 ? "1y" : years <= 2 ? "2y" : years <= 5 ? "5y" : "10y";
};

const fetchYahoo = async (asset, timeframe, limit) => {
  const interval = YAHOO_INTERVAL[timeframe];
  if (!interval) {
    throw new Error(
      `${asset.label} doesn't offer ${timeframe} data. Try 1 hour or 1 day.`,
    );
  }

  const url =
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(asset.symbol)}` +
    `?interval=${interval}&range=${yahooRange(interval, limit)}`;

  // Yahoo rejects requests without a browser-ish User-Agent.
  const response = await httpFetchDirectFirst(url, {
    headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(
      `Yahoo Finance refused the request for ${asset.label} (HTTP ${response.status}).`,
    );
  }

  const json = await response.json();
  const result = json?.chart?.result?.[0];
  if (!result) {
    const reason = json?.chart?.error?.description;
    throw new Error(
      reason
        ? `Yahoo Finance: ${reason}`
        : `Yahoo Finance returned no data for ${asset.label}.`,
    );
  }

  const quote = result.indicators?.quote?.[0] ?? {};
  const stamps = result.timestamp ?? [];

  const bars = [];
  for (let i = 0; i < stamps.length; i++) {
    const o = quote.open?.[i];
    const h = quote.high?.[i];
    const l = quote.low?.[i];
    const c = quote.close?.[i];
    // Yahoo pads the series with nulls on non-trading intervals. Those are
    // holes in the data, not zeros — dropping them is the only honest option.
    if (o == null || h == null || l == null || c == null) continue;
    bars.push({ time: stamps[i] * 1000, open: o, high: h, low: l, close: c });
  }

  if (!bars.length) {
    throw new Error(`Yahoo Finance returned no usable candles for ${asset.label}.`);
  }
  return bars;
};

/* ------------------------------------------------------------------ *
 * Shaping
 * ------------------------------------------------------------------ */

/**
 * Force the OHLC invariant the chart schema requires (high is the highest of
 * the four, low the lowest).
 *
 * This is a rounding repair, not an edit: providers publish each field rounded
 * independently, so a close can land a fraction above its own high. Left alone
 * the schema rejects the whole series. The correction can only ever widen a
 * bar's range to contain prices that provider itself reported.
 */
const repairBar = (bar) => ({
  ...bar,
  high: Math.max(bar.high, bar.open, bar.close),
  low: Math.min(bar.low, bar.open, bar.close),
});

/**
 * Force each open to the previous close.
 *
 * This DOES alter real prices — it closes the overnight gaps that make a daily
 * chart look ragged. Off by default, and the UI says what it does, because a
 * gap-free chart of a gappy market is a claim about that market.
 */
const stitchGaps = (bars) =>
  bars.map((bar, i) => {
    if (i === 0) return bar;
    const open = bars[i - 1].close;
    return {
      ...bar,
      open,
      high: Math.max(bar.high, open),
      low: Math.min(bar.low, open),
    };
  });

const round = (n, decimals) => Number(n.toFixed(decimals));

/* ------------------------------------------------------------------ *
 * Entry point
 * ------------------------------------------------------------------ */

export const fetchMarketSeries = async ({
  asset: assetId,
  timeframe = "1d",
  limit = 120,
  stitch = false,
}) => {
  const asset = getAsset(assetId);
  const count = Math.max(2, Math.min(Number(limit) || 120, 400));

  let bars;
  try {
    bars = await fetchYahoo(asset, timeframe, count);
  } catch (err) {
    // Rethrown with the provider named. "fetch failed" alone gives the editor
    // nothing to act on — it can't distinguish a blocked network from a bad
    // symbol, and this is the single most likely thing to go wrong here.
    const message = String(err?.message ?? err);
    throw new Error(
      /HTTP|Yahoo|Binance|timed out/i.test(message)
        ? message
        : `Couldn't reach the market data provider: ${message}`,
    );
  }

  const trimmed = bars.slice(-count).map(repairBar);
  const shaped = stitch ? stitchGaps(trimmed) : trimmed;

  return {
    meta: {
      asset: asset.id,
      label: asset.label,
      source: "Yahoo Finance",
      timeframe,
      decimals: asset.decimals,
      count: shaped.length,
      // Shown so the editor can caption the chart accurately.
      from: shaped[0]?.time ?? null,
      to: shaped[shaped.length - 1]?.time ?? null,
      stitched: Boolean(stitch),
    },
    candles: shaped.map((b) => ({
      open: round(b.open, asset.decimals),
      high: round(b.high, asset.decimals),
      low: round(b.low, asset.decimals),
      close: round(b.close, asset.decimals),
    })),
    /** For the line chart, which plots one value per point with an axis label. */
    points: shaped.map((b) => ({
      label: axisLabel(b.time, timeframe),
      value: round(b.close, asset.decimals),
    })),
  };
};

/** Short axis label — these sit under a tick, so they have to stay tiny. */
const axisLabel = (time, timeframe) => {
  const d = new Date(time);
  if (timeframe === "1wk" || timeframe === "1d") {
    return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
  }
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
};
