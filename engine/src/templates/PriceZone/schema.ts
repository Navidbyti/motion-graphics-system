import { z } from "zod";
import { decimals, label, subline, toggle, withCommon } from "../fields";
import { annotationSchema, beatSchema } from "../../charting/annotations";

export const barSchema = z.object({
  open: z.number(),
  high: z.number(),
  low: z.number(),
  close: z.number(),
});

export const zoneSchema = z.object({
  from: z.number().describe("Lower price of the zone"),
  to: z.number().describe("Upper price of the zone"),
});

export const markerSchema = z.object({
  value: z.number().describe("Price this label points at"),
  text: z.string().max(16).describe("Label text. Leave empty to show the price"),
});

export const priceZoneSchema = withCommon({
  ticker: label("Instrument, e.g. EUR/USD"),

  subtitle: subline("Timeframe or source, e.g. Daily · OANDA"),

  bars: z
    .array(barSchema)
    .min(10)
    .max(400)
    .describe(
      "Price history, oldest first. Each bar needs open, high, low and close. " +
        "Paste a few hundred rows from a spreadsheet.",
    ),

  /**
   * One ordered list, not a field per shape.
   *
   * The previous `zones` (max 3) and `markers` (max 4) could not express
   * drawing order — a zone always sat under a marker because of which array it
   * lived in — and could not be referenced individually by a reveal. A single
   * list fixes both: later items draw on top, and any item can be named by a
   * beat.
   */
  annotations: z
    .array(annotationSchema)
    .max(40)
    .describe("Zones, levels, trendlines, arrows — drawn in order, last on top"),

  /**
   * The reveal, one step at a time.
   *
   * Anything without a beat appears with the chart, so annotations can be added
   * without touching this and still produce a sensible video.
   */
  beats: z
    .array(beatSchema)
    .max(40)
    .describe("When each annotation appears. Leave empty to show everything at once"),

  /**
   * Alpha of the card behind the chart, 0–1.
   *
   * Was hardcoded at 0.75. Overlays are composited onto footage in Premiere,
   * and how much of that footage should show through the card is a per-video
   * judgement — a busy shot wants a more opaque backing, a clean one wants
   * almost none. 0 leaves the candles floating on the footage with no card at
   * all.
   */
  /**
   * Empty candle slots kept clear at the right.
   *
   * Breathing room on its own, and the only place a projection can live — a
   * predicted path drawn over history would be claiming to be history.
   */
  futureBars: z
    .number()
    .int()
    .min(0)
    .max(120)
    .describe("Empty space at the right, in candles"),

  backgroundAlpha: z
    .number()
    .min(0)
    .max(1)
    .describe("Background transparency. 0 = no card, 1 = solid"),

  decimals: decimals("Decimal places on prices"),

  showAxis: toggle("Show the price axis down the right"),

  showLast: toggle("Show the current price tag on the axis"),
});

export type PriceZoneProps = z.infer<typeof priceZoneSchema>;

/**
 * Defaults are generated rather than hand-written — a few hundred hand-typed
 * bars would be unreadable in source and impossible to keep plausible. This is
 * deterministic (no Math.random, which Remotion forbids anyway since it would
 * make every frame differ): the same input always produces the same series.
 */
const generateBars = (count: number) => {
  const bars: z.infer<typeof barSchema>[] = [];
  let price = 1.052;
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1);
    /**
     * A single smooth arc — rise, peak, easing back — plus three sines of
     * different periods for texture.
     *
     * The first version branched on `i < count * 0.3` to switch trend formulas,
     * and the two branches didn't meet at the boundary: the series jumped ~0.06
     * in one bar and rendered as a huge vertical spike through the middle of
     * the chart. Anything generating a price path has to be continuous.
     */
    const arc = Math.sin(t * Math.PI * 0.78) * 0.16;
    const drift =
      Math.sin(i / 17) * 0.011 + Math.sin(i / 41) * 0.016 + Math.sin(i / 6.5) * 0.003;
    const open = price;
    const close = 1.052 + arc + drift;
    const wick = 0.0016 + Math.abs(Math.sin(i / 5)) * 0.0022;
    bars.push({
      open: Number(open.toFixed(5)),
      high: Number((Math.max(open, close) + wick).toFixed(5)),
      low: Number((Math.min(open, close) - wick).toFixed(5)),
      close: Number(close.toFixed(5)),
    });
    price = close;
  }
  return bars;
};

export const priceZoneDefaults: PriceZoneProps = {
  brand: "billionaireSignal",
  ticker: "EUR / USD",
  subtitle: "Daily · OANDA",
  bars: generateBars(180),
  /*
    A worked example rather than a token one: two zones, a channel and a
    callout, revealed in sequence. The defaults are what a new user sees first,
    and "here is what this template is for" is worth more than an empty chart.
  */
  annotations: [
    { id: "supply", kind: "zone", from: 1.179, to: 1.1921, color: "#E4572E", label: "Supply", opacity: 0.55 },
    { id: "demand", kind: "zone", from: 1.107, to: 1.1193, color: "#1FA463", label: "Demand", opacity: 0.55 },
    {
      id: "trend",
      kind: "channel",
      a: { index: 18, price: 1.1035 },
      b: { index: 96, price: 1.1735 },
      offset: 0.021,
      extend: false,
      opacity: 0.55,
    },
    { id: "note", kind: "note", at: { index: 150, price: 1.1465 }, label: "Rejected", opacity: 1 },
    {
      id: "forecast",
      kind: "projection",
      color: "#7C5CFF",
      opacity: 1,
      points: [
        { index: 179, price: 1.1311 },
        { index: 184, price: 1.1268 },
        { index: 189, price: 1.1225 },
        { index: 194, price: 1.1252 },
        { index: 199, price: 1.1198 },
        { index: 204, price: 1.1155 },
        { index: 209, price: 1.1172 },
        { index: 214, price: 1.1121 },
        { index: 219, price: 1.1148 },
        { index: 224, price: 1.1195 },
      ],
    },
  ],

  beats: [
    { target: "supply", at: 0.2, duration: 0.55, effect: "wipe" },
    { target: "demand", at: 0.8, duration: 0.55, effect: "wipe" },
    { target: "trend", at: 1.5, duration: 0.9, effect: "draw" },
    { target: "note", at: 2.5, duration: 0.4, effect: "pop" },
    { target: "forecast", at: 3.1, duration: 1.1, effect: "draw" },
  ],
  futureBars: 52,
  backgroundAlpha: 0.75,
  decimals: 5,
  showAxis: true,
  showLast: true,
  scale: 1,
  direction: "auto",
  speed: 1,
};

export const TIMING = {
  intro: 0.3,
  /** The bar series wipes in over this long, whatever the bar count. */
  wipe: 1.3,
  /** Zone and markers land after the price action is on screen. */
  annotate: 0.45,
  hold: 1.2,
  outro: 0.9,
} as const;

/**
 * Duration follows the beat sheet.
 *
 * A fixed length would cut the video off mid-reveal the moment someone adds a
 * beat at four seconds — the composition has to be at least as long as the
 * analysis it is showing, plus time to read the last thing that appeared.
 */
export const priceZoneSeconds = (
  speed: number,
  beats: { at: number; duration: number }[] = [],
) => {
  const lastBeat = beats.reduce((max, b) => Math.max(max, b.at + b.duration), 0);
  return (
    (TIMING.intro + TIMING.wipe + lastBeat + TIMING.hold + TIMING.outro) / speed
  );
};
