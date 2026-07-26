import { z } from "zod";
import { decimals, label, subline, toggle, withCommon } from "../fields";

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

  zones: z
    .array(zoneSchema)
    .max(3)
    .describe("Highlighted price bands, e.g. a support area"),

  markers: z
    .array(markerSchema)
    .max(4)
    .describe("Labelled levels that point at a price"),

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
  zones: [{ from: 1.107, to: 1.1193 }],
  markers: [
    { value: 1.11929, text: "" },
    { value: 1.10701, text: "" },
  ],
  decimals: 5,
  showAxis: true,
  showLast: true,
  scale: 1,
  direction: "ltr",
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

export const priceZoneSeconds = (speed: number) =>
  (TIMING.intro + TIMING.wipe + TIMING.annotate + TIMING.hold + TIMING.outro) / speed;
