/**
 * CHART ANNOTATIONS — the analysis drawn on top of the candles.
 *
 * One discriminated union rather than a field per shape. A separate `zones`,
 * `lines`, `arrows` array each with its own cap is what the old Price Zone
 * template did, and it has two problems: the drawing order is fixed by which
 * array something lives in, and the reveal order cannot be expressed at all.
 * A single ordered list solves both — later items draw on top, and any item can
 * be referenced by a beat.
 *
 * Positions are stored as bar index plus price, never as pixels. The chart is
 * re-scaled for every output size and can be re-fetched with more bars; a
 * pixel-anchored annotation would end up pointing at the wrong candle.
 */

import { z } from "zod";
import { zColor } from "@remotion/zod-types";

/** A point a person would describe: "the high of the 40th candle". */
const point = z.object({
  index: z.number().describe("Which candle, counting from the left"),
  price: z.number().describe("Price at that point"),
});

/**
 * Every annotation carries an id.
 *
 * The beat sheet refers to annotations by id rather than by position, so
 * reordering or deleting one doesn't silently retime the others.
 */
const base = {
  id: z.string().describe("Internal — used by the beat sheet"),
  label: z.string().max(40).optional().describe("Text shown on it"),
  color: zColor().optional(),

  /**
   * How strongly this annotation reads, 0–1.
   *
   * Not a plain alpha multiplier, because that could only ever make things
   * fainter — and a band drawn over busy candles sometimes needs to be MORE
   * solid, not less. The value is mapped separately onto fills and lines (see
   * annotationAlpha): fills run 0 → 0.22 so the default sits at the light wash
   * used before, and lines stay legible across the whole range rather than
   * disappearing at the bottom of the dial.
   */
  opacity: z.number().min(0).max(1).default(0.55).describe("Transparency, 0 = invisible"),
};

export const annotationSchema = z.discriminatedUnion("kind", [
  /** A price band — supply, demand, value area. The screenshot's red/green. */
  z.object({
    ...base,
    kind: z.literal("zone"),
    from: z.number().describe("Lower price of the band"),
    to: z.number().describe("Upper price of the band"),
    /** Limits the band horizontally; omitted means edge to edge. */
    fromIndex: z.number().optional(),
    toIndex: z.number().optional(),
  }),

  /** A single horizontal price line. */
  z.object({
    ...base,
    kind: z.literal("level"),
    price: z.number(),
    style: z.enum(["solid", "dashed", "dotted"]).default("dashed"),
  }),

  /** Two-point diagonal — the trendline. */
  z.object({
    ...base,
    kind: z.literal("trendline"),
    a: point,
    b: point,
    style: z.enum(["solid", "dashed", "dotted"]).default("solid"),
    /** Continue past the second point to the right edge. */
    extend: z.boolean().default(false),
  }),

  /**
   * Parallel channel — a trendline plus a copy offset in price.
   *
   * Stored as an offset rather than as two independent lines so the pair stays
   * parallel when either end is dragged. Two free lines drift out of parallel
   * the moment one is touched, which is exactly what a channel must not do.
   */
  z.object({
    ...base,
    kind: z.literal("channel"),
    a: point,
    b: point,
    offset: z.number().describe("Price distance to the parallel copy"),
    extend: z.boolean().default(false),
  }),

  /** Dim everything except this run of candles. */
  z.object({
    ...base,
    kind: z.literal("focus"),
    fromIndex: z.number(),
    toIndex: z.number(),
    /** How dark the rest goes, 0–1. */
    dim: z.number().min(0).max(1).default(0.72),
  }),

  /** An arrow pointing at something. */
  z.object({
    ...base,
    kind: z.literal("arrow"),
    a: point.describe("Tail"),
    b: point.describe("Head — the thing being pointed at"),
  }),

  /** Free text pinned to a point on the chart. */
  z.object({
    ...base,
    kind: z.literal("note"),
    at: point,
  }),

  /** A vertical line marking a moment — the open, an event, a session. */
  z.object({
    ...base,
    kind: z.literal("vline"),
    index: z.number(),
    style: z.enum(["solid", "dashed", "dotted"]).default("dashed"),
  }),

  /**
   * Fibonacci retracement between a swing low and high.
   *
   * Levels are a prop rather than hardcoded: which ratios matter is a matter of
   * school, and 0.786 vs 0.705 is the kind of thing people argue about.
   */
  z.object({
    ...base,
    kind: z.literal("fib"),
    a: point.describe("Swing start"),
    b: point.describe("Swing end"),
    levels: z.array(z.number()).default([0, 0.236, 0.382, 0.5, 0.618, 0.786, 1]),
  }),

  /**
   * A projected continuation — where the price is expected to go.
   *
   * Rendered so it can never be mistaken for history: its own colour, a dashed
   * path, hollow markers, a boundary line at the last real candle and a
   * "Projection" tag that is not optional. An invented price path that looks
   * like data, under a real ticker, in front of an audience taking financial
   * cues from it, is a different kind of object than an opinion — the styling
   * is what keeps it the second thing.
   */
  z.object({
    ...base,
    kind: z.literal("projection"),
    points: z
      .array(point)
      .min(2)
      .max(40)
      .describe("The expected path, left to right"),

    /** Draw the path line joining the points, as well as the candles. */
    showPath: z.boolean().default(true).describe("Show the line through the points"),

    /** Draw simulated candles along the path. */
    showCandles: z.boolean().default(true).describe("Show simulated candles"),

    /**
     * How much the simulated candles wick beyond the path, 0–1.
     *
     * The path is the forecast; this is only how choppy the invented price
     * action around it looks. At 0 the candles sit exactly on the line.
     */
    volatility: z.number().min(0).max(1).default(0.5).describe("Candle wick size"),
  }),

  /**
   * The long/short position tool — entry, stop and target as one object, with
   * the reward and risk boxes shaded.
   *
   * One annotation rather than three levels because the risk-to-reward ratio is
   * the point of it, and that can only be computed if the three prices are
   * known to belong together.
   */
  z.object({
    ...base,
    kind: z.literal("position"),
    entry: z.number(),
    stop: z.number(),
    target: z.number(),
    fromIndex: z.number(),
    toIndex: z.number(),
  }),
]);

/**
 * Turn the single `opacity` dial into the two alphas the renderer needs.
 *
 * A fill and a stroke cannot share a number: at the fill's usable range a line
 * is nearly invisible, and at the line's the fill is a solid block hiding the
 * price action. So fills scale to a maximum of 0.22 and lines never drop below
 * 0.45 — the dial changes emphasis without ever producing something unreadable.
 */
export const annotationAlpha = (opacity = 0.55) => ({
  fill: opacity * 0.22,
  line: 0.45 + opacity * 0.55,
});

export type Annotation = z.infer<typeof annotationSchema>;
export type AnnotationKind = Annotation["kind"];

/**
 * One step of the reveal.
 *
 * This is the part with no substitute: a screenshot shows the finished
 * analysis, and what actually holds attention is watching it get built —
 * the zone appears, then the trendline draws in, then the eye is pushed onto
 * five candles. Timing is per beat because "let that land" is a judgement about
 * the specific chart, not a global speed.
 */
export const beatSchema = z.object({
  /** An annotation id, or "chart" for the candles themselves. */
  target: z.string(),
  at: z.number().min(0).max(60).describe("Seconds from the start"),
  duration: z.number().min(0.1).max(10).default(0.6).describe("How long it takes to appear"),
  effect: z
    .enum(["draw", "fade", "pop", "wipe"])
    .default("draw")
    .describe("Draw = traces along its length, Wipe = sweeps in from one side"),
});

export type Beat = z.infer<typeof beatSchema>;

/**
 * Every price an annotation touches, so the scale can include it.
 *
 * A target above the highest candle, or a stop below the lowest, still has to
 * be on screen — otherwise it renders off-frame and looks like it was dropped.
 */
export const annotationPrices = (annotations: Annotation[]): number[] => {
  const prices: number[] = [];
  for (const a of annotations) {
    switch (a.kind) {
      case "zone":
        prices.push(a.from, a.to);
        break;
      case "level":
        prices.push(a.price);
        break;
      case "trendline":
      case "arrow":
        prices.push(a.a.price, a.b.price);
        break;
      case "channel":
        prices.push(a.a.price, a.b.price, a.a.price + a.offset, a.b.price + a.offset);
        break;
      case "fib":
        prices.push(a.a.price, a.b.price);
        break;
      case "note":
        prices.push(a.at.price);
        break;
      case "projection":
        for (const p of a.points) prices.push(p.price);
        break;
      case "position":
        prices.push(a.entry, a.stop, a.target);
        break;
      // focus and vline are horizontal-only — they constrain nothing vertically.
      default:
        break;
    }
  }
  return prices;
};

/**
 * Resolve a beat for one annotation into a 0→1 progress value.
 *
 * Anything with no beat is treated as visible from the moment the chart is
 * drawn, so adding annotations without touching the beat sheet still produces
 * a sensible video.
 */
export const beatProgress = (
  id: string,
  beats: Beat[],
  frame: number,
  fps: number,
  chartReadyFrame: number,
): { progress: number; effect: Beat["effect"] } => {
  const beat = beats.find((x) => x.target === id);
  if (!beat) return { progress: 1, effect: "fade" };

  const start = chartReadyFrame + beat.at * fps;
  const end = start + Math.max(beat.duration, 0.1) * fps;
  const progress = Math.min(Math.max((frame - start) / (end - start), 0), 1);
  return { progress, effect: beat.effect };
};
