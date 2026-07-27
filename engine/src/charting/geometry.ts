/**
 * CHART GEOMETRY — the one place that turns prices and bar indexes into
 * positions, and back again.
 *
 * This exists because two different programs need the identical answer. The
 * template renders the chart; the editor lets you draw on top of it with the
 * mouse. If each computed its own mapping they would drift, and drift here is
 * not subtle — a trendline would render somewhere other than where it was
 * drawn, and the export would disagree with the preview. That is the exact
 * class of bug this project has been bitten by repeatedly, so the mapping is
 * shared rather than duplicated.
 *
 * Everything is normalised to a 0–100 box. The chart is drawn into an SVG with
 * `viewBox="0 0 100 100"` and `preserveAspectRatio="none"`, so the same numbers
 * work at any output size, and the editor only has to know where that box sits
 * on screen.
 */

export type Bar = { open: number; high: number; low: number; close: number };

/** A point on the chart, in the coordinates a person thinks in. */
export type ChartPoint = {
  /** Bar index, fractional so a line can start between two candles. */
  index: number;
  price: number;
};

export type PriceScale = {
  /** Lowest price the plot shows, after padding. */
  lo: number;
  /** Highest price the plot shows, after padding. */
  hi: number;
  /** How many bars the plot holds. */
  count: number;
};

/**
 * Work out the visible price range.
 *
 * `extra` carries any annotation prices — a zone or a target above the highest
 * candle still has to be on screen, or it renders off-frame and looks like it
 * was dropped. Padding is proportional so the candles never touch the edges.
 */
export const priceScale = (
  bars: Bar[],
  extra: number[] = [],
  padding = 0.08,
): PriceScale => {
  const values = [
    ...bars.map((b) => b.low),
    ...bars.map((b) => b.high),
    ...extra.filter((v) => Number.isFinite(v)),
  ];

  const rawLo = values.length ? Math.min(...values) : 0;
  const rawHi = values.length ? Math.max(...values) : 1;
  // A dead-flat series has zero range; without a floor every price maps to the
  // same pixel and the chart collapses to a line.
  const pad = (rawHi - rawLo) * padding || Math.abs(rawHi) * 0.01 || 1;

  return { lo: rawLo - pad, hi: rawHi + pad, count: bars.length };
};

/* ------------------------------------------------------------------ *
 * Price ↔ vertical position
 * ------------------------------------------------------------------ */

/** Price → percentage UP from the bottom. Use for CSS `bottom`. */
export const priceToPct = (price: number, s: PriceScale) =>
  ((price - s.lo) / (s.hi - s.lo)) * 100;

/** Price → SVG y. SVG grows downward, so this is the inverse. */
export const priceToSvgY = (price: number, s: PriceScale) =>
  100 - priceToPct(price, s);

/** SVG y → price. The inverse of priceToSvgY, for reading the mouse. */
export const svgYToPrice = (y: number, s: PriceScale) =>
  s.lo + ((100 - y) / 100) * (s.hi - s.lo);

/* ------------------------------------------------------------------ *
 * Bar index ↔ horizontal position
 * ------------------------------------------------------------------ */

/** Width of one candle's slot, in the 0–100 box. */
export const slotWidth = (s: PriceScale) => 100 / Math.max(s.count, 1);

/** Bar index → SVG x at the CENTRE of that candle. */
export const indexToSvgX = (index: number, s: PriceScale) => {
  const slot = slotWidth(s);
  return index * slot + slot / 2;
};

/** SVG x → fractional bar index. The inverse, for reading the mouse. */
export const svgXToIndex = (x: number, s: PriceScale) => {
  const slot = slotWidth(s);
  return (x - slot / 2) / slot;
};

/* ------------------------------------------------------------------ *
 * Snapping
 * ------------------------------------------------------------------ */

/**
 * Pull a freely-dragged price onto something meaningful.
 *
 * Drawing by hand lands on 1.13847 when what was meant was the candle low at
 * 1.13840 or the round number at 1.14000. Levels that are almost-but-not-quite
 * on a swing point look like mistakes on a chart people are reading closely.
 *
 * `tolerance` is a fraction of the visible range, so snapping feels the same
 * whether the chart spans 20 pips or 2000 points.
 */
export const snapPrice = (
  price: number,
  bars: Bar[],
  s: PriceScale,
  { tolerance = 0.012, index }: { tolerance?: number; index?: number } = {},
): number => {
  const window = (s.hi - s.lo) * tolerance;
  const candidates: number[] = [];

  // Nearby candle extremes — the points a trader would actually mark.
  const from = index == null ? 0 : Math.max(0, Math.round(index) - 3);
  const to = index == null ? bars.length : Math.min(bars.length, Math.round(index) + 4);
  for (let i = from; i < to; i++) {
    const bar = bars[i];
    if (bar) candidates.push(bar.high, bar.low, bar.open, bar.close);
  }

  // Round numbers at a sensible step for this range.
  const magnitude = 10 ** Math.floor(Math.log10((s.hi - s.lo) / 4 || 1));
  for (const step of [magnitude, magnitude / 2]) {
    candidates.push(Math.round(price / step) * step);
  }

  let best = price;
  let bestDistance = window;
  for (const candidate of candidates) {
    const distance = Math.abs(candidate - price);
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return best;
};

/** Snap a dragged index to the nearest whole candle. */
export const snapIndex = (index: number, s: PriceScale) =>
  Math.max(0, Math.min(s.count - 1, Math.round(index)));
