/**
 * Find the chart data in a set of props, by SHAPE rather than by name.
 *
 * Build mode used to look for props literally called `bars` and `annotations`,
 * which is fine while every chart template is one we wrote. A pasted template
 * names its own fields — `marks`, `prices`, `zones` — and the toggle simply did
 * not appear, with nothing to explain why.
 *
 * Shape is the honest test anyway. A thing is candle data because it has open,
 * high, low and close; it is an annotation list because its items say what kind
 * of shape they are. Matching on that works for templates nobody has written
 * yet, which is the whole point of letting people paste them in.
 */

export type ChartKeys = { bars: string; annotations: string } | null;

const isBar = (v: unknown) =>
  typeof v === "object" &&
  v !== null &&
  ["open", "high", "low", "close"].every(
    (k) => typeof (v as Record<string, unknown>)[k] === "number",
  );

const isAnnotation = (v: unknown) =>
  typeof v === "object" &&
  v !== null &&
  typeof (v as Record<string, unknown>).kind === "string" &&
  typeof (v as Record<string, unknown>).id === "string";

/**
 * An empty array matches an annotation list but not bars.
 *
 * Deliberate asymmetry. A chart with no candles has nothing to draw and nothing
 * to place shapes against, so there is no useful Build mode. A chart with no
 * annotations YET is the normal starting state — that is exactly when someone
 * needs the tool.
 */
export const findChartKeys = (props: Record<string, unknown>): ChartKeys => {
  let bars: string | undefined;
  let annotations: string | undefined;

  for (const [key, value] of Object.entries(props)) {
    if (!Array.isArray(value)) continue;
    if (!bars && value.length >= 2 && value.every(isBar)) bars = key;
    if (!annotations && value.every(isAnnotation)) annotations = key;
  }

  return bars && annotations ? { bars, annotations } : null;
};
