import { z } from "zod";
import {
  currency,
  decimals,
  label,
  subline,
  toggle,
  withCommon,
} from "../fields";

/**
 * Every `.describe()` here does double duty: it is the label the editor sees in
 * the app's props form, AND the only clue the prompt→props model gets about what
 * the field means. Write them for a person, not for a developer.
 */

export const candleSchema = z
  .object({
    open: z.number().describe("Price at the start of this period"),
    high: z.number().describe("Highest price reached"),
    low: z.number().describe("Lowest price reached"),
    close: z.number().describe("Price at the end of this period"),
  })
  /**
   * Cross-field validation, and the reason prompt→props is safe.
   *
   * Per-field types alone would happily accept a candle whose "high" is below
   * its "open" — impossible data that renders as an inverted wick. This is
   * exactly the mistake a language model makes when inventing a price series,
   * so the schema has to catch it. A rejected candle triggers a retry with the
   * error fed back, rather than a broken frame reaching the timeline.
   */
  .refine(
    (c) => c.high >= Math.max(c.open, c.close) && c.low <= Math.min(c.open, c.close),
    {
      message:
        "high must be the highest of the four values and low the lowest " +
        "(high ≥ open/close ≥ low)",
    },
  );

/**
 * Composed from the shared field vocabulary wherever possible — only `candles`
 * is genuinely unique to this template. That keeps labels, limits and control
 * types identical across the library.
 */
export const candleChartSchema = withCommon({
  ticker: label("Market or ticker name shown at the top, e.g. NASDAQ"),

  subtitle: subline("Small line under the ticker, e.g. the timeframe or date"),

  candles: z
    .array(candleSchema)
    .min(2)
    .max(60)
    .describe(
      "The candles, left to right. Each needs open, high, low and close. " +
        "Paste from a spreadsheet or let the prompt fill them.",
    ),

  currency: currency(),

  decimals: decimals("Decimal places on the price readout"),

  // Up/down colours are NOT props: they come from the selected brand's palette.
  // A Billionaire Signal chart must not be able to render in Cash for Chat's
  // green, and two fewer knobs is two fewer things to explain. Per-template
  // overrides can be reintroduced if a real need appears.

  showGrid: toggle("Show faint horizontal price gridlines"),

  showDelta: toggle("Show the percentage change badge next to the price"),

  highlightLast: toggle("Glow the final candle and label its closing price"),
});

export type CandleChartProps = z.infer<typeof candleChartSchema>;

/**
 * Defaults must render a complete, presentable result with no other input —
 * this is what the Library thumbnail is generated from.
 *
 * The data is Rumi's own worked example: 14 candles, 412 → 447, dipping to 398
 * around the fifth. Useful as a default because it exercises both colours and a
 * visible reversal rather than a flat climb.
 */
export const candleChartDefaults: CandleChartProps = {
  // Financial content, so it defaults to Billionaire Signal — but it renders in
  // any of the three.
  brand: "billionaireSignal",
  ticker: "NASDAQ",
  subtitle: "Last 14 sessions",
  currency: "$",
  decimals: 2,
  showGrid: true,
  showDelta: true,
  highlightLast: true,
  speed: 1,
  candles: [
    { open: 412, high: 416, low: 410, close: 415 },
    { open: 415, high: 419, low: 413, close: 418 },
    { open: 418, high: 420, low: 409, close: 411 },
    { open: 411, high: 413, low: 401, close: 403 },
    { open: 403, high: 405, low: 398, close: 400 },
    { open: 400, high: 408, low: 399, close: 407 },
    { open: 407, high: 414, low: 406, close: 413 },
    { open: 413, high: 418, low: 411, close: 417 },
    { open: 417, high: 424, low: 416, close: 422 },
    { open: 422, high: 428, low: 420, close: 427 },
    { open: 427, high: 431, low: 424, close: 429 },
    { open: 429, high: 437, low: 428, close: 436 },
    { open: 436, high: 443, low: 434, close: 441 },
    { open: 441, high: 449, low: 440, close: 447 },
  ],
};

/* ------------------------------------------------------------------ *
 * Timing — shared by the component and by calculateMetadata, so the
 * composition's length and its animation can never drift apart.
 * ------------------------------------------------------------------ */

/**
 * Defaults tuned to feel deliberate rather than rushed. The editor can override
 * the whole sequence with the `speed` slider, so these set the house pace rather
 * than a limit.
 */
export const TIMING = {
  intro: 0.5,
  perCandle: 0.075,
  settle: 1.0,
  outro: 1.2,
} as const;

export const candleChartSeconds = (candleCount: number, speed: number) =>
  (TIMING.intro + candleCount * TIMING.perCandle + TIMING.settle + TIMING.outro) /
  speed;
