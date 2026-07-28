/**
 * Click a point on a chart instead of typing an index and a price.
 *
 * This deliberately does NOT draw on the video preview. Doing that would mean
 * working out where the plot sits inside the composition — through the card's
 * padding, the axis gutter and the safe areas — and keeping that in step with
 * the template's layout forever. Every future layout tweak would silently move
 * the click target.
 *
 * The editor never needed the composition's pixel layout. It needs the price
 * and the bar index, and those come from the same geometry module the renderer
 * uses. So this is its own small chart of the same data: clicks are exact, it
 * cannot drift from the template, and it is a far bigger target than a 9:16
 * preview scaled into a panel.
 */

import { useRef } from "react";
import {
  priceScale,
  priceToSvgY,
  indexToSvgX,
  slotWidth,
  snapIndex,
  snapPrice,
  svgXToIndex,
  svgYToPrice,
  type Bar,
} from "@engine/charting/geometry";

export const ChartPicker: React.FC<{
  bars: Bar[];
  /** Empty slots at the right — a projection is placed in them. */
  futureBars?: number;
  /** Prices that must stay in view, so the picker matches the render. */
  extraPrices?: number[];
  onPick: (point: { index: number; price: number }) => void;
  onCancel: () => void;
  /** What is being placed, so the prompt says something useful. */
  prompt: string;
  /** Points already placed for this shape, drawn so you can see the path. */
  existing?: { index: number; price: number }[];
}> = ({ bars, futureBars = 0, extraPrices = [], onPick, onCancel, prompt, existing = [] }) => {
  const svgRef = useRef<SVGSVGElement>(null);

  const scale = priceScale(bars, extraPrices, 0.08, futureBars);
  const slot = slotWidth(scale);
  const bodyW = Math.max(slot * 0.62, 0.05);

  const click = (event: React.MouseEvent<SVGSVGElement>) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;

    /*
      Straight to the 0–100 box the geometry speaks in. The SVG stretches to
      whatever size the panel gives it, so a percentage of the element's own
      rect is the only thing that stays correct at any width.
    */
    const x = ((event.clientX - rect.left) / rect.width) * 100;
    const y = ((event.clientY - rect.top) / rect.height) * 100;

    const rawIndex = svgXToIndex(x, scale);
    const rawPrice = svgYToPrice(y, scale);

    onPick({
      index: snapIndex(rawIndex, scale),
      // Snapping to nearby candle extremes and round numbers — a level that is
      // almost-but-not-quite on a swing high looks like a mistake.
      price: Number(snapPrice(rawPrice, bars, scale, { index: rawIndex }).toFixed(6)),
    });
  };

  return (
    <div className="picker">
      <div className="row-between">
        <span className="small">{prompt}</span>
        <button className="link" onClick={onCancel}>
          Cancel
        </button>
      </div>

      <svg
        ref={svgRef}
        className="picker-canvas"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        onClick={click}
      >
        {bars.map((bar, i) => {
          const cx = indexToSvgX(i, scale);
          const top = priceToSvgY(Math.max(bar.open, bar.close), scale);
          const h = Math.max(
            priceToSvgY(Math.min(bar.open, bar.close), scale) - top,
            0.4,
          );
          const up = bar.close >= bar.open;
          return (
            <g key={i}>
              <line
                x1={cx}
                y1={priceToSvgY(bar.high, scale)}
                x2={cx}
                y2={priceToSvgY(bar.low, scale)}
                stroke={up ? "#22c55e" : "#ef4444"}
                strokeWidth={0.6}
                vectorEffect="non-scaling-stroke"
              />
              <rect
                x={cx - bodyW / 2}
                y={top}
                width={bodyW}
                height={h}
                fill={up ? "#22c55e" : "#ef4444"}
              />
            </g>
          );
        })}

        {/* The boundary between real candles and reserved space. */}
        {futureBars > 0 ? (
          <line
            x1={indexToSvgX(bars.length - 0.5, scale)}
            y1={0}
            x2={indexToSvgX(bars.length - 0.5, scale)}
            y2={100}
            stroke="#8b97a8"
            strokeWidth={1}
            strokeDasharray="2 2"
            vectorEffect="non-scaling-stroke"
          />
        ) : null}

        {/* Points already placed, joined so the shape is visible as it builds. */}
        {existing.length > 1 ? (
          <polyline
            points={existing
              .map((p) => `${indexToSvgX(p.index, scale)},${priceToSvgY(p.price, scale)}`)
              .join(" ")}
            fill="none"
            stroke="#7C5CFF"
            strokeWidth={1.6}
            vectorEffect="non-scaling-stroke"
          />
        ) : null}
        {existing.map((p, n) => (
          <circle
            key={n}
            cx={indexToSvgX(p.index, scale)}
            cy={priceToSvgY(p.price, scale)}
            r={1}
            fill="#7C5CFF"
          />
        ))}
      </svg>

      <span className="muted small">
        Click the chart. Snaps to nearby highs, lows and round numbers.
      </span>
    </div>
  );
};
