/**
 * THE PLOT — candles or a line, drawn into whatever box it is given.
 *
 * Pulled out of the chart templates so a pasted template can have a real chart
 * without a second implementation of one. Two drawings of the same candles is
 * two sets of rounding, two ideas of how wide a body is, and eventually a
 * pasted chart that does not match the built-in one beside it in the same
 * video.
 *
 * Everything is in the 0–100 box the geometry module speaks in, with
 * `preserveAspectRatio="none"` so the same numbers work at any size. The
 * annotation editor and Build mode already read prices and bar indexes through
 * that same box, which is what lets a shape dragged on screen land exactly
 * where it exports.
 */

import React from "react";
import type { BrandPalette } from "../brand/brands";
import {
  indexToSvgX,
  priceToSvgY,
  slotWidth,
  type Bar,
  type PriceScale,
} from "./geometry";

export type PlotKind = "candles" | "line";

/**
 * Candle bodies and wicks as four paths, split by direction.
 *
 * Four paths rather than four elements per bar: 400 candles is 1,600 nodes
 * drawn individually, and the renderer composites every one of them on every
 * frame. Splitting by direction means the two colours need no per-bar element
 * at all.
 */
const candlePaths = (bars: Bar[], scale: PriceScale) => {
  const slot = slotWidth(scale);
  const bodyW = Math.max(slot * 0.62, 0.02);
  const out = { upBody: "", downBody: "", upWick: "", downWick: "" };

  bars.forEach((bar, i) => {
    const cx = indexToSvgX(i, scale);
    const x0 = cx - bodyW / 2;
    const x1 = cx + bodyW / 2;
    const top = priceToSvgY(Math.max(bar.open, bar.close), scale);
    const bottom = priceToSvgY(Math.min(bar.open, bar.close), scale);
    // A doji is a zero-height rect and vanishes entirely; give it a hairline.
    const h = Math.max(bottom - top, 0.15);

    const body = `M ${x0} ${top} L ${x1} ${top} L ${x1} ${top + h} L ${x0} ${top + h} Z `;
    const wick = `M ${cx} ${priceToSvgY(bar.high, scale)} L ${cx} ${priceToSvgY(bar.low, scale)} `;

    if (bar.close >= bar.open) {
      out.upBody += body;
      out.upWick += wick;
    } else {
      out.downBody += body;
      out.downWick += wick;
    }
  });

  return out;
};

export const Plot: React.FC<{
  kind: PlotKind;
  bars: Bar[];
  scale: PriceScale;
  palette: BrandPalette;
  /** 0–1. The chart wipes in from the left as this advances. */
  progress: number;
  /** Stroke width in composition pixels — already through `px()`. */
  stroke: number;
  /*
    No children. Annotations are a SIBLING of the plot, never nested inside it:
    AnnotationLayer draws its shapes in its own SVG and its labels as HTML,
    because a label inside a stretched `preserveAspectRatio="none"` box would
    have its glyphs stretched with it. HTML inside an <svg> renders as nothing
    at all, so nesting silently loses every label — shapes appear, names do not.
  */
}> = ({ kind, bars, scale, palette, progress, stroke }) => {
  const wipe = Math.max(0, Math.min(1, progress));

  const line =
    kind === "line" && bars.length
      ? bars
          .map((b, i) => `${indexToSvgX(i, scale)},${priceToSvgY(b.close, scale)}`)
          .join(" ")
      : "";

  const paths = kind === "candles" ? candlePaths(bars, scale) : null;

  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
    >
      <defs>
        {/*
          A clip, not a stroke-dash reveal. Dash offset draws a line along its
          own length, which is right for a single stroke and wrong for candles —
          each bar would grow out of its own middle. A left-to-right wipe is the
          same gesture for both, and it is what reading a chart actually feels
          like.
        */}
        <clipPath id="plot-wipe" clipPathUnits="objectBoundingBox">
          <rect x="0" y="0" width={wipe} height="1" />
        </clipPath>
      </defs>

      <g clipPath="url(#plot-wipe)">
        {paths ? (
          <>
            <path
              d={paths.upWick}
              stroke={palette.positive}
              strokeWidth={stroke}
              vectorEffect="non-scaling-stroke"
              fill="none"
            />
            <path
              d={paths.downWick}
              stroke={palette.negative}
              strokeWidth={stroke}
              vectorEffect="non-scaling-stroke"
              fill="none"
            />
            <path d={paths.upBody} fill={palette.positive} />
            <path d={paths.downBody} fill={palette.negative} />
          </>
        ) : (
          <polyline
            points={line}
            fill="none"
            stroke={palette.primary}
            strokeWidth={stroke * 2}
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        )}
      </g>
    </svg>
  );
};
