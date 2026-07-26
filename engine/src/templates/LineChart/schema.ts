import { z } from "zod";
import { currency, decimals, label, subline, toggle, withCommon } from "../fields";

export const pointSchema = z.object({
  /** Axis label — a month, a year, a quarter. Kept short; it sits under a tick. */
  label: z.string().max(10).describe("Label under this point, e.g. Jul or 2026"),
  value: z.number().describe("The value at this point"),
});

export const lineChartSchema = withCommon({
  title: label("Series name shown at the top, e.g. Fed Funds Rate"),

  subtitle: subline("Small line under the title, e.g. the range or period"),

  points: z
    .array(pointSchema)
    .min(2)
    .max(40)
    .describe(
      "The line, left to right. Each point needs a label and a value. " +
        "Paste from a spreadsheet.",
    ),

  currency: currency("Symbol before the value. Leave empty for none"),

  suffix: label("Text after the value, e.g. % — leave empty for none"),

  decimals: decimals("Decimal places on the values"),

  showArea: toggle("Fill the area under the line"),

  showDots: toggle("Show a dot at each point"),

  showGrid: toggle("Show faint horizontal gridlines with value labels"),

  showDelta: toggle("Show the change from first to last point"),

  colourByTrend: toggle(
    "Colour the line green when it ends higher and red when lower. " +
      "Off uses the brand's primary colour",
  ),
});

export type LineChartProps = z.infer<typeof lineChartSchema>;

/**
 * Defaults are the Fed funds rate path — a real series with flat runs and step
 * changes, which is a better stress test than a smooth curve: it exercises
 * repeated identical values, a plateau, and a decline.
 */
export const lineChartDefaults: LineChartProps = {
  brand: "billionaireSignal",
  title: "Fed Funds Rate",
  subtitle: "Upper bound, monthly",
  currency: "",
  suffix: "%",
  decimals: 2,
  showArea: true,
  showDots: true,
  showGrid: true,
  showDelta: true,
  colourByTrend: true,
  scale: 1,
  direction: "ltr",
  speed: 1,
  points: [
    { label: "May", value: 4.5 },
    { label: "Jun", value: 4.5 },
    { label: "Jul", value: 4.5 },
    { label: "Aug", value: 4.5 },
    { label: "Sep", value: 4.25 },
    { label: "Oct", value: 4.0 },
    { label: "Nov", value: 4.0 },
    { label: "Dec", value: 3.75 },
    { label: "2026", value: 3.75 },
    { label: "Feb", value: 3.75 },
    { label: "Mar", value: 3.75 },
    { label: "Apr", value: 3.75 },
    { label: "May", value: 3.75 },
    { label: "Jun", value: 3.75 },
  ],
};

export const TIMING = {
  intro: 0.35,
  /** The line draws over this many seconds regardless of point count. */
  draw: 1.6,
  settle: 0.8,
  outro: 1.0,
} as const;

export const lineChartSeconds = (speed: number) =>
  (TIMING.intro + TIMING.draw + TIMING.settle + TIMING.outro) / speed;
