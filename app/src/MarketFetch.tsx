/**
 * MARKET DATA PANEL
 *
 * Fills a chart's data array from a real market series, so building a
 * "NASDAQ from X to Y" chart is a dropdown rather than 200 rows of typing.
 *
 * There is no fallback to generated prices. If the fetch fails the editor gets
 * the reason and an empty result — never a plausible-looking invented series
 * under a real ticker. See server/market.mjs for why that matters more here
 * than the convenience would.
 */

import { useEffect, useState } from "react";
import { api, getWhenReady } from "./api";

type Asset = { id: string; label: string };
type Timeframe = { id: string; label: string };

export type MarketShape = "ohlc" | "points";

type Series = {
  meta: {
    label: string;
    source: string;
    timeframe: string;
    count: number;
    decimals: number;
    stitched: boolean;
  };
  candles: { open: number; high: number; low: number; close: number }[];
  points: { label: string; value: number }[];
};

export const MarketFetch: React.FC<{
  /** Which shape the target field wants — OHLC bars or labelled points. */
  shape: MarketShape;
  maxRows: number;
  onData: (rows: Record<string, unknown>[], meta: Series["meta"]) => void;
}> = ({ shape, maxRows, onData }) => {
  const [open, setOpen] = useState(false);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [timeframes, setTimeframes] = useState<Timeframe[]>([]);

  const [asset, setAsset] = useState("NASDAQ");
  const [timeframe, setTimeframe] = useState("1d");
  const [count, setCount] = useState(Math.min(120, maxRows));
  const [stitch, setStitch] = useState(false);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState<Series["meta"] | null>(null);

  useEffect(() => {
    if (!open || assets.length) return;
    // Retries until the render server is up — see getWhenReady.
    getWhenReady<{ assets: Asset[]; timeframes: Timeframe[] }>("/api/market/assets")
      .then((d) => {
        setAssets(d.assets ?? []);
        setTimeframes(d.timeframes ?? []);
      })
      .catch((err) => setError(String(err?.message ?? err)));
  }, [open, assets.length]);

  const fetchNow = async () => {
    setBusy(true);
    setError(null);
    setLoaded(null);
    try {
      const response = await fetch(api("/api/market/series"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          asset,
          timeframe,
          limit: Math.min(count, maxRows),
          stitch,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error ?? "The request failed.");

      const series = data as Series;
      const rows = shape === "ohlc" ? series.candles : series.points;
      onData(rows as unknown as Record<string, unknown>[], series.meta);
      setLoaded(series.meta);
    } catch (err) {
      setError(String((err as Error)?.message ?? err));
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button className="market-open" onClick={() => setOpen(true)}>
        Fetch market data
      </button>
    );
  }

  return (
    <div className="market">
      <div className="row-between">
        <strong className="small">Market data</strong>
        <button className="link" onClick={() => setOpen(false)}>
          Close
        </button>
      </div>

      <div className="market-grid">
        <label className="field">
          <span className="field-label">Instrument</span>
          <select value={asset} onChange={(e) => setAsset(e.target.value)}>
            {assets.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span className="field-label">Timeframe</span>
          <select value={timeframe} onChange={(e) => setTimeframe(e.target.value)}>
            {timeframes.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span className="field-label">Candles back (max {maxRows})</span>
          <input
            type="number"
            min={2}
            max={maxRows}
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
          />
        </label>
      </div>

      <label className="market-check">
        <input
          type="checkbox"
          checked={stitch}
          onChange={(e) => setStitch(e.target.checked)}
        />
        <span className="small">
          Close the gaps — forces each open to the previous close.{" "}
          <span className="muted">
            Tidier line, but it changes the real opening prices.
          </span>
        </span>
      </label>

      <button className="primary" onClick={fetchNow} disabled={busy || !assets.length}>
        {busy ? "Fetching…" : "Fetch and fill"}
      </button>

      {error ? (
        <p className="error small">
          {error}
          <br />
          <span className="muted">
            Nothing was filled in — the chart still holds whatever was there before.
          </span>
        </p>
      ) : null}

      {loaded ? (
        <p className="ok small">
          {loaded.count} × {loaded.label} {loaded.timeframe} from {loaded.source}
          {loaded.stitched ? " · gaps closed" : ""}
        </p>
      ) : null}
    </div>
  );
};
