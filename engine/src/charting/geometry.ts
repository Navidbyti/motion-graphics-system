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
  /**
   * Empty candle slots reserved past the last bar.
   *
   * The plot divides its width by the slot count, so reserving slots is all it
   * takes to leave the right-hand side clear — the candles simply stop early
   * and everything else keeps the same geometry. That gap is breathing room on
   * its own, and it is where a projection has to be drawn: a predicted path
   * needs somewhere to go that is visibly not history.
   */
  futureSlots = 0,
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

  return { lo: rawLo - pad, hi: rawHi + pad, count: bars.length + futureSlots };
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

/* ------------------------------------------------------------------ *
 * Smoothing
 * ------------------------------------------------------------------ */

/**
 * A smooth curve through a set of points, as a function of bar index.
 *
 * Joining placed points with straight segments makes every point a corner, and
 * twenty deliberately-placed points become twenty visible kinks — the path
 * reads as a chain of decisions rather than as one movement.
 *
 * Monotone cubic Hermite (Fritsch–Carlson), not a Catmull-Rom or a plain
 * cardinal spline, for two reasons that matter here:
 *
 * 1. It is a FUNCTION of the index, so the same curve can be asked "what is the
 *    price at bar 34?" — which is what the candles are built from. A parametric
 *    spline gives a shape but not an answer, and the candles would then have to
 *    follow a different curve from the line drawn over them.
 * 2. It cannot overshoot. An ordinary spline through a peak swings ABOVE the
 *    peak, so a forecast tops out somewhere the person never clicked. The
 *    monotone limiter flattens the slope at every high and low instead, which
 *    is the gentle rounded turn wanted at the tops and bottoms.
 */
export const smoothPrice = (
  points: ChartPoint[],
): ((index: number) => number) => {
  // Sorted, and duplicate indexes dropped — two prices at one index has no
  // answer, and it would divide by a zero-width interval.
  const pts = [...points]
    .sort((p, q) => p.index - q.index)
    .filter((p, i, all) => i === 0 || p.index > all[i - 1].index);

  if (!pts.length) return () => 0;
  if (pts.length === 1) return () => pts[0].price;

  const n = pts.length;
  const dx: number[] = [];
  const delta: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    dx.push(pts[i + 1].index - pts[i].index);
    delta.push((pts[i + 1].price - pts[i].price) / dx[i]);
  }

  // Slope at each point: the average of the two neighbouring gradients, except
  // where the direction changes — a turning point gets a flat slope, which is
  // what rounds it off instead of spiking it.
  const m: number[] = new Array(n);
  m[0] = delta[0];
  m[n - 1] = delta[n - 2];
  for (let i = 1; i < n - 1; i++) {
    m[i] = delta[i - 1] * delta[i] <= 0 ? 0 : (delta[i - 1] + delta[i]) / 2;
  }

  // The Fritsch–Carlson limiter. Without it the curve can still bulge past the
  // points it is meant to pass through on a steep-then-shallow pair.
  for (let i = 0; i < n - 1; i++) {
    if (delta[i] === 0) {
      m[i] = 0;
      m[i + 1] = 0;
      continue;
    }
    const a = m[i] / delta[i];
    const b = m[i + 1] / delta[i];
    const s = a * a + b * b;
    if (s > 9) {
      const t = 3 / Math.sqrt(s);
      m[i] = t * a * delta[i];
      m[i + 1] = t * b * delta[i];
    }
  }

  return (index: number) => {
    if (index <= pts[0].index) return pts[0].price;
    if (index >= pts[n - 1].index) return pts[n - 1].price;

    let i = 0;
    while (i < n - 2 && index > pts[i + 1].index) i++;

    const h = dx[i];
    const t = (index - pts[i].index) / h;
    const t2 = t * t;
    const t3 = t2 * t;

    return (
      (2 * t3 - 3 * t2 + 1) * pts[i].price +
      (t3 - 2 * t2 + t) * h * m[i] +
      (-2 * t3 + 3 * t2) * pts[i + 1].price +
      (t3 - t2) * h * m[i + 1]
    );
  };
};

/**
 * The smooth curve as an SVG path, sampled rather than expressed as béziers.
 *
 * Sampling costs a few hundred coordinates and buys two things worth more than
 * that: the drawn line is the identical curve the candles were built from — no
 * second implementation to drift — and a partial reveal is a shorter sample
 * range rather than splitting a bézier at an arbitrary t.
 */
export const smoothPathD = (
  priceAt: (index: number) => number,
  from: number,
  to: number,
  s: PriceScale,
  /** Samples per candle slot. Eight is past the point of visible facets. */
  per = 8,
): string => {
  if (!(to > from)) return "";
  const steps = Math.max(2, Math.ceil((to - from) * per));
  let d = "";
  for (let i = 0; i <= steps; i++) {
    const idx = from + ((to - from) * i) / steps;
    const x = indexToSvgX(idx, s).toFixed(3);
    const y = priceToSvgY(priceAt(idx), s).toFixed(3);
    d += `${i === 0 ? "M" : "L"} ${x} ${y} `;
  }
  return d.trim();
};
