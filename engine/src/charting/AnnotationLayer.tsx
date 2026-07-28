/**
 * Draws the analysis over the candles.
 *
 * Two layers, and the split is forced by the plot's geometry. The chart SVG uses
 * `preserveAspectRatio="none"` so a 0–100 box stretches to whatever the output
 * size is — which is ideal for shapes and fatal for text, since the glyphs would
 * stretch with it. So shapes render in the SVG and every label is HTML,
 * positioned as a percentage over the same box.
 *
 * Strokes carry `vector-effect: non-scaling-stroke` for the same reason: without
 * it a 1-unit line is thicker vertically than horizontally on a non-square
 * plot, and diagonals visibly change weight along their length.
 */

import type { BrandPalette } from "../brand/brands";
import {
  type Annotation,
  type Beat,
  annotationAlpha,
  beatProgress,
} from "./annotations";
import {
  type PriceScale,
  indexToSvgX,
  priceToPct,
  priceToSvgY,
  slotWidth,
} from "./geometry";

type Props = {
  annotations: Annotation[];
  beats: Beat[];
  scale: PriceScale;
  palette: BrandPalette;
  frame: number;
  fps: number;
  /** Frame at which the candles have finished drawing — beats count from here. */
  chartReadyFrame: number;
  /** Scales stroke widths and type with the composition. */
  px: (n: number) => number;
  decimals: number;
};

const DASH: Record<string, string | undefined> = {
  solid: undefined,
  dashed: "3 2",
  dotted: "0.6 1.6",
};

/** Reveal a straight line by drawing it from a towards b. */
const drawn = (
  ax: number,
  ay: number,
  bx: number,
  by: number,
  progress: number,
) => ({ x2: ax + (bx - ax) * progress, y2: ay + (by - ay) * progress });

export const AnnotationLayer: React.FC<Props> = ({
  annotations,
  beats,
  scale,
  palette,
  frame,
  fps,
  chartReadyFrame,
  px,
  decimals,
}) => {
  const format = (v: number) => v.toFixed(decimals);
  // Thin enough to read as annotation rather than as part of the chart.
  const stroke = px(2.2);

  /** Where a label sits, as percentages over the plot box. */
  const labels: {
    key: string;
    left: number;
    bottom: number;
    text: string;
    color: string;
    opacity: number;
    align: "left" | "right";
    /** Draws a short tick from the tag to the thing it names. */
    leader?: boolean;
  }[] = [];

  const shapes: React.ReactNode[] = [];

  annotations.forEach((a, order) => {
    const { progress, effect } = beatProgress(
      a.id,
      beats,
      frame,
      fps,
      chartReadyFrame,
    );
    if (progress <= 0) return;

    const tone = a.color ?? palette.primary;
    // One dial, two alphas — a fill and a stroke cannot share a number.
    const alpha = annotationAlpha(a.opacity);
    const key = `${a.kind}-${a.id}-${order}`;
    // Fade and pop both just ramp opacity; draw and wipe are per-shape below.
    const reveal = effect === "draw" || effect === "wipe" ? 1 : progress;
    const opacity = reveal * alpha.line;

    switch (a.kind) {
      case "zone": {
        const yTo = priceToSvgY(a.to, scale);
        const yFrom = priceToSvgY(a.from, scale);
        const top = Math.min(yTo, yFrom);
        const height = Math.abs(yFrom - yTo);
        const x0 = a.fromIndex != null ? indexToSvgX(a.fromIndex, scale) : 0;
        const x1 = a.toIndex != null ? indexToSvgX(a.toIndex, scale) : 100;
        // Wipe grows the band from its left edge; anything else fades it in.
        const width = (x1 - x0) * (effect === "wipe" || effect === "draw" ? progress : 1);

        shapes.push(
          <g key={key} opacity={opacity}>
            <rect x={x0} y={top} width={width} height={height} fill={tone} fillOpacity={alpha.fill} />
            <rect x={x0} y={top} width={width} height={0.18} fill={tone} fillOpacity={alpha.line} />
            <rect
              x={x0}
              y={top + height - 0.18}
              width={width}
              height={0.18}
              fill={tone}
              fillOpacity={alpha.line}
            />
          </g>,
        );

        /*
          One tag per EDGE, not one in the middle.

          A band is defined by two prices and a trader reads both of them, so a
          single label averaging them answers a question nobody asked. The
          reference charts everyone is used to tag the top and the bottom
          separately, each pointing at its own line.
        */
        [
          { price: a.to, suffix: a.label ? ` ${a.label}` : "" },
          { price: a.from, suffix: "" },
        ].forEach((edge, n) => {
          labels.push({
            key: `${key}-edge-${n}`,
            left: 100,
            bottom: priceToPct(edge.price, scale),
            text: `${format(edge.price)}${edge.suffix}`,
            color: tone,
            opacity: progress,
            align: "right",
            leader: true,
          });
        });
        break;
      }

      case "level": {
        const y = priceToSvgY(a.price, scale);
        const width = 100 * (effect === "draw" || effect === "wipe" ? progress : 1);
        shapes.push(
          <line
            key={key}
            x1={0}
            y1={y}
            x2={width}
            y2={y}
            stroke={tone}
            strokeWidth={stroke}
            strokeDasharray={DASH[a.style]}
            vectorEffect="non-scaling-stroke"
            opacity={opacity}
          />,
        );
        labels.push({
          key: `${key}-label`,
          left: 100,
          bottom: priceToPct(a.price, scale),
          text: a.label || format(a.price),
          color: tone,
          opacity: progress,
          align: "right",
        });
        break;
      }

      case "trendline": {
        const ax = indexToSvgX(a.a.index, scale);
        const ay = priceToSvgY(a.a.price, scale);
        let bx = indexToSvgX(a.b.index, scale);
        let by = priceToSvgY(a.b.price, scale);

        if (a.extend && bx !== ax) {
          // Continue the same gradient to the right edge.
          const gradient = (by - ay) / (bx - ax);
          by = ay + gradient * (100 - ax);
          bx = 100;
        }

        const end = drawn(ax, ay, bx, by, effect === "fade" || effect === "pop" ? 1 : progress);
        shapes.push(
          <line
            key={key}
            x1={ax}
            y1={ay}
            x2={end.x2}
            y2={end.y2}
            stroke={tone}
            strokeWidth={stroke}
            strokeDasharray={DASH[a.style]}
            vectorEffect="non-scaling-stroke"
            opacity={opacity}
            strokeLinecap="round"
          />,
        );
        if (a.label) {
          labels.push({
            key: `${key}-label`,
            left: (ax + bx) / 2,
            bottom: 100 - (ay + by) / 2,
            text: a.label,
            color: tone,
            opacity: progress,
            align: "left",
          });
        }
        break;
      }

      case "channel": {
        const ax = indexToSvgX(a.a.index, scale);
        const bx0 = indexToSvgX(a.b.index, scale);
        const ay = priceToSvgY(a.a.price, scale);
        const by = priceToSvgY(a.b.price, scale);
        const ay2 = priceToSvgY(a.a.price + a.offset, scale);
        const by2 = priceToSvgY(a.b.price + a.offset, scale);

        let bx = bx0;
        let byEnd = by;
        let by2End = by2;
        if (a.extend && bx0 !== ax) {
          const gradient = (by - ay) / (bx0 - ax);
          byEnd = ay + gradient * (100 - ax);
          by2End = ay2 + gradient * (100 - ax);
          bx = 100;
        }

        const p = effect === "fade" || effect === "pop" ? 1 : progress;
        const e1 = drawn(ax, ay, bx, byEnd, p);
        const e2 = drawn(ax, ay2, bx, by2End, p);

        shapes.push(
          <g key={key} opacity={opacity}>
            <polygon
              points={`${ax},${ay} ${e1.x2},${e1.y2} ${e2.x2},${e2.y2} ${ax},${ay2}`}
              fill={tone}
              fillOpacity={alpha.fill}
            />
            <line x1={ax} y1={ay} x2={e1.x2} y2={e1.y2} stroke={tone} strokeWidth={stroke} vectorEffect="non-scaling-stroke" strokeLinecap="round" />
            <line x1={ax} y1={ay2} x2={e2.x2} y2={e2.y2} stroke={tone} strokeWidth={stroke} vectorEffect="non-scaling-stroke" strokeLinecap="round" />
          </g>,
        );
        break;
      }

      case "focus": {
        const slot = slotWidth(scale);
        const x0 = a.fromIndex * slot;
        const x1 = (a.toIndex + 1) * slot;
        const cover = palette.ink;
        shapes.push(
          <g key={key} opacity={progress * a.dim}>
            <rect x={0} y={0} width={Math.max(x0, 0)} height={100} fill={cover} />
            <rect x={x1} y={0} width={Math.max(100 - x1, 0)} height={100} fill={cover} />
          </g>,
        );
        break;
      }

      case "arrow": {
        const ax = indexToSvgX(a.a.index, scale);
        const ay = priceToSvgY(a.a.price, scale);
        const bx = indexToSvgX(a.b.index, scale);
        const by = priceToSvgY(a.b.price, scale);
        const p = effect === "fade" || effect === "pop" ? 1 : progress;
        const end = drawn(ax, ay, bx, by, p);

        // Arrowhead as a rotated triangle at the head, sized in plot units.
        const angle = Math.atan2(by - ay, bx - ax);
        const head = 2.2;
        const hx = end.x2;
        const hy = end.y2;
        const wing = 0.42;
        const points = [
          `${hx},${hy}`,
          `${hx - head * Math.cos(angle - wing)},${hy - head * Math.sin(angle - wing)}`,
          `${hx - head * Math.cos(angle + wing)},${hy - head * Math.sin(angle + wing)}`,
        ].join(" ");

        shapes.push(
          <g key={key} opacity={opacity}>
            <line x1={ax} y1={ay} x2={hx} y2={hy} stroke={tone} strokeWidth={stroke} vectorEffect="non-scaling-stroke" strokeLinecap="round" />
            {p > 0.6 ? <polygon points={points} fill={tone} /> : null}
          </g>,
        );
        if (a.label) {
          labels.push({
            key: `${key}-label`,
            left: ax,
            bottom: 100 - ay,
            text: a.label,
            color: tone,
            opacity: progress,
            align: "left",
          });
        }
        break;
      }

      case "note": {
        labels.push({
          key: `${key}-label`,
          left: indexToSvgX(a.at.index, scale),
          bottom: priceToPct(a.at.price, scale),
          text: a.label ?? "",
          color: tone,
          opacity: progress,
          align: "left",
        });
        break;
      }

      case "vline": {
        const x = indexToSvgX(a.index, scale);
        const height = 100 * (effect === "draw" || effect === "wipe" ? progress : 1);
        shapes.push(
          <line
            key={key}
            x1={x}
            y1={0}
            x2={x}
            y2={height}
            stroke={tone}
            strokeWidth={stroke}
            strokeDasharray={DASH[a.style]}
            vectorEffect="non-scaling-stroke"
            opacity={opacity}
          />,
        );
        break;
      }

      case "fib": {
        const span = a.b.price - a.a.price;
        const x0 = indexToSvgX(a.a.index, scale);
        const x1 = indexToSvgX(a.b.index, scale);
        a.levels.forEach((ratio, n) => {
          const price = a.a.price + span * ratio;
          const y = priceToSvgY(price, scale);
          // Levels appear in sequence rather than all at once — it reads as the
          // tool being placed rather than a grid switching on.
          const step = Math.min(Math.max(progress * a.levels.length - n, 0), 1);
          if (step <= 0) return;
          shapes.push(
            <line
              key={`${key}-${ratio}`}
              x1={x0}
              y1={y}
              x2={x0 + (Math.max(x1, 100) - x0) * step}
              y2={y}
              stroke={tone}
              strokeWidth={stroke}
              strokeDasharray="3 2"
              vectorEffect="non-scaling-stroke"
              opacity={0.85}
            />,
          );
          labels.push({
            key: `${key}-${ratio}-label`,
            left: 100,
            bottom: priceToPct(price, scale),
            text: `${(ratio * 100).toFixed(1)}%  ${format(price)}`,
            color: tone,
            opacity: step,
            align: "right",
          });
        });
        break;
      }

      case "projection": {
        /*
          Rendered as CANDLES, not a line.

          The points are the prediction; the candles are how price actually
          looks, and a polyline beside a candle chart reads as an annotation
          rather than as "here is what happens next". So each whole bar index
          between the first and last point gets an OHLC built from the path.

          Every signal that this is opinion is kept: its own colour, HOLLOW
          bodies, a boundary rule where history stops, and a "Projection" tag
          that cannot be turned off. Hollow is the load-bearing one — filled
          bodies in any colour read as data at a glance.
        */
        const pts = [...a.points].sort((p, q) => p.index - q.index);
        if (pts.length < 2) break;

        /** Price on the path at a given index, straight-line between points. */
        const priceAt = (idx: number) => {
          if (idx <= pts[0].index) return pts[0].price;
          const last = pts[pts.length - 1];
          if (idx >= last.index) return last.price;
          for (let n = 0; n < pts.length - 1; n++) {
            const p = pts[n];
            const q = pts[n + 1];
            if (idx >= p.index && idx <= q.index) {
              const t = q.index === p.index ? 0 : (idx - p.index) / (q.index - p.index);
              return p.price + (q.price - p.price) * t;
            }
          }
          return last.price;
        };

        /*
          Deterministic wick texture. Math.random is forbidden here — Remotion
          renders each frame in isolation, so a random wick would differ between
          frames and the projection would visibly boil. Hashing the bar index
          gives the same value every time it is asked.
        */
        const noise = (n: number) => {
          const x = Math.sin(n * 12.9898) * 43758.5453;
          return x - Math.floor(x);
        };

        const firstIndex = Math.round(pts[0].index);
        const lastIndex = Math.round(pts[pts.length - 1].index);

        // Wick size follows how fast the path is moving, so a flat forecast
        // gets small wicks and a sharp one gets large ones.
        const steps: number[] = [];
        for (let i = firstIndex + 1; i <= lastIndex; i++) {
          steps.push(Math.abs(priceAt(i) - priceAt(i - 1)));
        }
        const meanStep =
          steps.length ? steps.reduce((t, v) => t + v, 0) / steps.length : 0;

        const total = Math.max(lastIndex - firstIndex, 1);
        const shown = total * (effect === "fade" || effect === "pop" ? 1 : progress);
        const slot = slotWidth(scale);
        const bodyW = Math.max(slot * 0.62, 0.02);

        const candles: React.ReactNode[] = [];
        for (let i = firstIndex + 1; i <= lastIndex; i++) {
          if (i - firstIndex > shown) break;
          const open = priceAt(i - 1);
          const close = priceAt(i);
          const range = Math.max(Math.abs(close - open), meanStep * 0.6, (scale.hi - scale.lo) * 0.002);
          const high = Math.max(open, close) + range * (0.25 + 0.75 * noise(i));
          const low = Math.min(open, close) - range * (0.25 + 0.75 * noise(i + 977));

          const cx = indexToSvgX(i, scale);
          const top = priceToSvgY(Math.max(open, close), scale);
          // A flat bar would be a zero-height rect and vanish entirely.
          const h = Math.max(priceToSvgY(Math.min(open, close), scale) - top, 0.15);

          candles.push(
            <g key={`${key}-c${i}`}>
              <line
                x1={cx}
                y1={priceToSvgY(high, scale)}
                x2={cx}
                y2={priceToSvgY(low, scale)}
                stroke={tone}
                strokeWidth={px(1.6)}
                vectorEffect="non-scaling-stroke"
              />
              <rect
                x={cx - bodyW / 2}
                y={top}
                width={bodyW}
                height={h}
                fill="none"
                stroke={tone}
                strokeWidth={px(2)}
                vectorEffect="non-scaling-stroke"
              />
            </g>,
          );
        }

        shapes.push(
          <g key={key} opacity={opacity}>
            {/* Where history stops and opinion starts. */}
            <line
              x1={indexToSvgX(firstIndex, scale)}
              y1={0}
              x2={indexToSvgX(firstIndex, scale)}
              y2={100}
              stroke={tone}
              strokeWidth={stroke}
              strokeDasharray="1.5 2"
              vectorEffect="non-scaling-stroke"
              opacity={0.5}
            />
            {candles}
          </g>,
        );

        labels.push({
          key: `${key}-tag`,
          left: indexToSvgX((firstIndex + lastIndex) / 2, scale),
          bottom:
            priceToPct(Math.max(...pts.map((p) => p.price)), scale) + 6,
          // Not `a.label ||` — the word has to be there whatever else is.
          text: a.label ? `Projection · ${a.label}` : "Projection",
          color: tone,
          opacity: progress,
          align: "left",
        });
        break;
      }

      case "position": {
        const x0 = indexToSvgX(a.fromIndex, scale);
        const x1 = indexToSvgX(a.toIndex, scale);
        const width = (x1 - x0) * (effect === "fade" || effect === "pop" ? 1 : progress);
        const yEntry = priceToSvgY(a.entry, scale);
        const yStop = priceToSvgY(a.stop, scale);
        const yTarget = priceToSvgY(a.target, scale);

        const risk = Math.abs(a.entry - a.stop);
        const reward = Math.abs(a.target - a.entry);
        const rr = risk > 0 ? reward / risk : 0;

        shapes.push(
          <g key={key} opacity={opacity}>
            <rect
              x={x0}
              y={Math.min(yEntry, yTarget)}
              width={width}
              height={Math.abs(yTarget - yEntry)}
              fill={palette.positive}
              fillOpacity={0.16}
            />
            <rect
              x={x0}
              y={Math.min(yEntry, yStop)}
              width={width}
              height={Math.abs(yStop - yEntry)}
              fill={palette.negative}
              fillOpacity={0.16}
            />
            <line x1={x0} y1={yEntry} x2={x0 + width} y2={yEntry} stroke={palette.textPrimary} strokeWidth={stroke} vectorEffect="non-scaling-stroke" />
          </g>,
        );

        labels.push({
          key: `${key}-rr`,
          left: 100,
          bottom: priceToPct(a.entry, scale),
          text: a.label ?? `${rr.toFixed(1)}R`,
          color: palette.textPrimary,
          opacity: progress,
          align: "right",
        });
        break;
      }

      default:
        break;
    }
  });

  return (
    <>
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
      >
        {shapes}
      </svg>

      {/*
        Labels are HTML, not SVG text — the plot box is stretched to the output
        size and SVG glyphs would stretch with it.
      */}
      {labels.map((l) => (
        <div
          key={l.key}
          style={{
            position: "absolute",
            bottom: `${l.bottom}%`,
            ...(l.align === "right"
              ? { right: 0, transform: "translate(0, 50%)" }
              : { left: `${l.left}%`, transform: "translate(-50%, 50%)" }),
            opacity: l.opacity,
            display: "flex",
            alignItems: "center",
            gap: px(6),
            pointerEvents: "none",
          }}
        >
          {/*
            A short tick joining the tag to the line it names. Without it a tag
            floating beside the chart has to be matched to its level by eye,
            which is exactly the moment a viewer stops listening.
          */}
          {l.leader ? (
            <div style={{ width: px(26), height: px(2), background: l.color, opacity: 0.7 }} />
          ) : null}
          <div
            style={{
              background: l.color,
              color: palette.paper,
              padding: `${px(4)}px ${px(10)}px`,
              borderRadius: px(6),
              fontSize: px(24),
              fontWeight: 600,
              letterSpacing: px(-0.4),
              whiteSpace: "nowrap",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {l.text}
          </div>
        </div>
      ))}
    </>
  );
};
