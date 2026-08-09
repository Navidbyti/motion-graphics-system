/**
 * The MACD panel — the lower half of every charting app.
 *
 * Its own component, and its own layer type, because it is not a variation of
 * the price chart: it has a different vertical scale centred on zero, and a
 * histogram that is a third series derived from the other two. A template
 * cannot subtract one array from another, so this has to exist as a capability
 * or the graphic simply cannot be made — which is exactly what happened when
 * someone asked for it and got a text layer instead.
 *
 * Draws into the 0–100 box like everything else, so it sits in a `box` and is
 * placed the same way as any other layer.
 */

import React from "react";
import type { BrandPalette } from "../brand/brands";
import { indexToSvgX, slotWidth, type Bar, type PriceScale } from "./geometry";
import { macd } from "./indicators";

export const MacdPanel: React.FC<{
  bars: Bar[];
  /** Shares the price chart's slot count so the two panels line up vertically. */
  scale: PriceScale;
  palette: BrandPalette;
  fastPeriod: number;
  slowPeriod: number;
  signalPeriod: number;
  lineColor: string;
  signalColor: string;
  /** 0–1, wipes in from the left like the price does. */
  progress: number;
  stroke: number;
  showHistogram: boolean;
}> = ({
  bars,
  scale,
  palette,
  fastPeriod,
  slowPeriod,
  signalPeriod,
  lineColor,
  signalColor,
  progress,
  stroke,
  showHistogram,
}) => {
  if (bars.length < 3) return null;

  const { line, signal, histogram } = macd(bars, fastPeriod, slowPeriod, signalPeriod);

  /*
    Symmetric around zero, scaled to the largest excursion of anything drawn.

    Zero has to sit on the centre line or the panel lies about which side of it
    the momentum is on — the single thing this chart exists to show. Padded to
    1.35 so the tallest bar has air above it rather than touching the edge.
  */
  const peak =
    Math.max(
      ...line.map(Math.abs),
      ...signal.map(Math.abs),
      ...(showHistogram ? histogram.map(Math.abs) : [0]),
    ) * 1.35 || 1;

  const y = (v: number) => 50 - (v / peak) * 50;
  const wipe = Math.max(0, Math.min(1, progress));
  const barW = Math.max(slotWidth(scale) * 0.62, 0.02);

  const path = (values: number[]) =>
    values.map((v, i) => `${indexToSvgX(i, scale)},${y(v)}`).join(" ");

  /*
    One path per sign, not one rect per bar. At 200 candles that is 200 elements
    the renderer composites every frame, and the pair of paths is also how the
    candles are drawn — same reasoning, same shape of solution.
  */
  let up = "";
  let down = "";
  if (showHistogram) {
    histogram.forEach((v, i) => {
      const cx = indexToSvgX(i, scale);
      const top = Math.min(y(v), 50);
      const height = Math.max(Math.abs(y(v) - 50), 0.15);
      const rect = `M ${cx - barW / 2} ${top} h ${barW} v ${height} h ${-barW} Z `;
      if (v >= 0) up += rect;
      else down += rect;
    });
  }

  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
    >
      <defs>
        <clipPath id="macd-wipe" clipPathUnits="objectBoundingBox">
          <rect x="0" y="0" width={wipe} height="1" />
        </clipPath>
      </defs>

      {/* The zero line, always visible — the histogram is meaningless without it. */}
      <line
        x1={0}
        y1={50}
        x2={100}
        y2={50}
        stroke={palette.textSecondary}
        strokeWidth={stroke * 0.8}
        strokeOpacity={0.5}
        vectorEffect="non-scaling-stroke"
      />

      <g clipPath="url(#macd-wipe)">
        {showHistogram ? (
          <>
            <path d={up} fill={palette.positive} fillOpacity={0.85} />
            <path d={down} fill={palette.negative} fillOpacity={0.85} />
          </>
        ) : null}

        <polyline
          points={path(line)}
          fill="none"
          stroke={lineColor}
          strokeWidth={stroke * 2}
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
        <polyline
          points={path(signal)}
          fill="none"
          stroke={signalColor}
          strokeWidth={stroke * 2}
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      </g>
    </svg>
  );
};
