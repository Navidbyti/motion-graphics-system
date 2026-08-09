/**
 * INDICATORS — the arithmetic a template is not allowed to do.
 *
 * The pasted-template format has no expressions on purpose: that is what stops
 * a graphic pasted from a chat window running arbitrary maths in a render. But
 * "no expressions" is only tenable if the things people actually need are
 * available as capabilities. A moving average is not a layout decision, it is a
 * calculation over the data, and no amount of prompting produces one from JSON.
 *
 * So this is the other half of that bargain. An indicator is computed here,
 * once, correctly, and a template declares that it wants one — exactly the way
 * it declares that it wants market data rather than fetching it itself.
 */

import type { Bar } from "./geometry";

export type IndicatorKind = "ema" | "sma";

/**
 * Exponential moving average.
 *
 * Seeded with the first value rather than with an SMA of the first `period`
 * bars. Both are defensible; this one is what every charting package a viewer
 * has seen does, and matching the familiar answer matters more here than the
 * textbook one — the chart is being read against TradingView from memory.
 *
 * The first bars are still warm-up and lean heavily on that seed. Templates
 * that care crop the left edge; the values are never wrong, just young.
 */
export const ema = (values: number[], period: number): number[] => {
  if (!values.length) return [];
  const alpha = 2 / (period + 1);
  const out = [values[0]];
  for (let i = 1; i < values.length; i++) {
    out.push(alpha * values[i] + (1 - alpha) * out[i - 1]);
  }
  return out;
};

/**
 * Simple moving average.
 *
 * Back-filled over the warm-up rather than left undefined. A line that starts
 * partway across the chart looks like a rendering fault, and the alternative —
 * holes in the array — puts a null check in every drawing path for a case
 * nobody wants to see anyway.
 */
export const sma = (values: number[], period: number): number[] => {
  const out: number[] = [];
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    out.push(sum / Math.min(i + 1, period));
  }
  return out;
};

export const indicator = (
  kind: IndicatorKind,
  bars: Bar[],
  period: number,
): number[] => {
  const closes = bars.map((b) => b.close);
  return kind === "sma" ? sma(closes, period) : ema(closes, period);
};

/**
 * How many bars at the left are still settling.
 *
 * An EMA seeded from one value takes roughly a period and a half to stop being
 * mostly that seed. Nothing here forces a template to crop, but it is what a
 * template should crop by if it wants only trustworthy values on screen.
 */
export const warmup = (period: number) => Math.ceil(period * 1.5);
