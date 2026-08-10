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

/** A computed line drawn over the price, already resolved to values and colour. */
export type PlotOverlay = {
  /** One value per bar. */
  values: number[];
  color: string;
  width: number;
  /** 0–1, its own draw progress. */
  progress: number;
};

export type PlotShading = {
  a: number[];
  b: number[];
  above: string;
  below: string;
  opacity: number;
  /** 0–1, how far across the shading has filled. */
  progress: number;
};

/**
 * The band between two lines, split wherever they cross.
 *
 * Built as one path per side rather than a quad per bar pair: at 200 bars that
 * is 400 elements the renderer composites every frame, and they seam visibly
 * against each other at low opacity — the overlap of adjacent translucent
 * shapes reads as vertical banding.
 */
const shadePaths = (s: PlotShading, scale: PriceScale, upTo: number) => {
  let above = "";
  let below = "";

  const n = Math.min(s.a.length, s.b.length, upTo);
  for (let i = 0; i < n - 1; i++) {
    const x0 = indexToSvgX(i, scale);
    const x1 = indexToSvgX(i + 1, scale);
    const quad =
      `M ${x0} ${priceToSvgY(s.a[i], scale)} ` +
      `L ${x1} ${priceToSvgY(s.a[i + 1], scale)} ` +
      `L ${x1} ${priceToSvgY(s.b[i + 1], scale)} ` +
      `L ${x0} ${priceToSvgY(s.b[i], scale)} Z `;

    // Which line is on top decides the colour, per bar. That is the whole
    // reading of the graphic: the band flips when the averages cross.
    if (s.a[i] >= s.b[i]) above += quad;
    else below += quad;
  }

  return { above, below };
};

export const Plot: React.FC<{
  kind: PlotKind;
  bars: Bar[];
  scale: PriceScale;
  palette: BrandPalette;
  /** 0–1. The chart wipes in from the left as this advances. */
  progress: number;
  /** Grey price, for charts whose subject is something drawn on top. */
  grayscale?: boolean;
  /** 0–1 multiplier on the price, so overlays can become the subject. */
  priceOpacity?: number;
  overlays?: PlotOverlay[];
  shading?: PlotShading;
  /**
   * `wipe` uncovers finished candles behind a moving edge. `grow` gives each
   * candle its own short entrance as the sweep reaches it, so the chart builds
   * rather than being revealed — which is what "animate it candle by candle"
   * means, and a hard edge sweeping across never will be.
   */
  reveal?: "wipe" | "grow";
  /** Stroke width in composition pixels — already through `px()`. */
  stroke: number;
  /*
    No children. Annotations are a SIBLING of the plot, never nested inside it:
    AnnotationLayer draws its shapes in its own SVG and its labels as HTML,
    because a label inside a stretched `preserveAspectRatio="none"` box would
    have its glyphs stretched with it. HTML inside an <svg> renders as nothing
    at all, so nesting silently loses every label — shapes appear, names do not.
  */
}> = ({
  kind,
  bars,
  scale,
  palette,
  progress,
  stroke,
  grayscale = false,
  priceOpacity = 1,
  overlays = [],
  shading,
  reveal = "wipe",
}) => {
  const wipe = Math.max(0, Math.min(1, progress));

  /*
    Grey, not "the brand colours desaturated". Two greys far enough apart to
    still read as up and down at phone size, and dark enough that a coloured
    line over them is unambiguously the subject.
  */
  const upColor = grayscale ? "#586069" : palette.positive;
  const downColor = grayscale ? "#414A54" : palette.negative;

  const line =
    kind === "line" && bars.length
      ? bars
          .map((b, i) => `${indexToSvgX(i, scale)},${priceToSvgY(b.close, scale)}`)
          .join(" ")
      : "";

  /*
    Combined paths for the wipe, individual elements for the grow.

    Four paths is the right answer at 400 candles — 1,600 nodes composited per
    frame otherwise — and it is the wrong answer when each candle needs its own
    progress, because a path cannot animate a piece of itself. So the expensive
    shape is opt-in and only paid for by templates that ask for it.
  */
  const paths = kind === "candles" && reveal === "wipe" ? candlePaths(bars, scale) : null;
  const grow = kind === "candles" && reveal === "grow";

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

      {grow ? (
        <g opacity={priceOpacity}>
          {bars.map((bar, i) => {
            /*
              Each candle's own progress, from where the sweep has reached.
              Divided by the bar count so the last candle finishes exactly as
              the sweep does, and given a short tail of its own so it grows
              rather than appearing.
            */
            const reached = wipe * bars.length;
            const t = Math.max(0, Math.min(1, reached - i));
            if (t <= 0) return null;

            const cx = indexToSvgX(i, scale);
            const bodyW = Math.max(slotWidth(scale) * 0.62, 0.02);
            const up = bar.close >= bar.open;
            const top = priceToSvgY(Math.max(bar.open, bar.close), scale);
            const bottom = priceToSvgY(Math.min(bar.open, bar.close), scale);
            const midY = (top + bottom) / 2;
            const h = Math.max(bottom - top, 0.15);

            return (
              <g key={i} opacity={t}>
                <line
                  x1={cx}
                  y1={midY + (priceToSvgY(bar.high, scale) - midY) * t}
                  x2={cx}
                  y2={midY + (priceToSvgY(bar.low, scale) - midY) * t}
                  stroke={up ? upColor : downColor}
                  strokeWidth={stroke}
                  vectorEffect="non-scaling-stroke"
                />
                {/* Grows out of its own middle, the way a candle forms. */}
                <rect
                  x={cx - bodyW / 2}
                  y={midY - (h * t) / 2}
                  width={bodyW}
                  height={h * t}
                  fill={up ? upColor : downColor}
                />
              </g>
            );
          })}
        </g>
      ) : null}

      <g clipPath="url(#plot-wipe)" opacity={priceOpacity}>
        {paths ? (
          <>
            <path
              d={paths.upWick}
              stroke={upColor}
              strokeWidth={stroke}
              vectorEffect="non-scaling-stroke"
              fill="none"
            />
            <path
              d={paths.downWick}
              stroke={downColor}
              strokeWidth={stroke}
              vectorEffect="non-scaling-stroke"
              fill="none"
            />
            <path d={paths.upBody} fill={upColor} />
            <path d={paths.downBody} fill={downColor} />
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

      {/*
        Shading first, then the lines over it. The band is the subject in a
        MACD explainer but it is still a fill, and a fill on top of a 3px line
        washes the line out at any opacity worth seeing the band at.
      */}
      {shading && shading.progress > 0
        ? (() => {
            const upTo = Math.ceil(
              Math.max(0, Math.min(1, shading.progress)) *
                Math.min(shading.a.length, shading.b.length),
            );
            const { above, below } = shadePaths(shading, scale, upTo);
            return (
              <>
                <path d={above} fill={shading.above} fillOpacity={shading.opacity} />
                <path d={below} fill={shading.below} fillOpacity={shading.opacity} />
              </>
            );
          })()
        : null}

      {overlays.map((o, n) => {
        if (o.progress <= 0 || o.values.length < 2) return null;
        /*
          Each overlay carries its own clip, so a template can bring one line in
          after another has finished. A shared wipe would force them to arrive
          together, which is the opposite of what a teaching chart needs — the
          whole point is showing the fast line react before the slow one.
        */
        const id = `plot-overlay-${n}`;
        return (
          <g key={n}>
            <defs>
              <clipPath id={id} clipPathUnits="objectBoundingBox">
                <rect x="0" y="0" width={Math.max(0, Math.min(1, o.progress))} height="1" />
              </clipPath>
            </defs>
            <polyline
              clipPath={`url(#${id})`}
              points={o.values
                .map((v, i) => `${indexToSvgX(i, scale)},${priceToSvgY(v, scale)}`)
                .join(" ")}
              fill="none"
              stroke={o.color}
              strokeWidth={o.width}
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          </g>
        );
      })}
    </svg>
  );
};
