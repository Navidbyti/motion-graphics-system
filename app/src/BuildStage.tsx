/**
 * BUILD MODE — the chart as an object you handle, not a video you watch.
 *
 * Preview mode answers "what will this look like?". It is a render: animated,
 * timed, and completely inert. Every attempt to edit through it has been
 * awkward for one reason — the thing on screen is a frame of a movie, so the
 * shape you want to move isn't there to be grabbed. The editing controls ended
 * up somewhere else, and "somewhere else" turned out to mean off the bottom of
 * a scrolled panel.
 *
 * So this is the other state. Time is frozen, nothing animates, and every
 * annotation is present as geometry with handles on it. Drag a handle and the
 * number changes. Click empty space with a field armed and it takes that point.
 * The same geometry module drives this and the renderer, so a shape placed here
 * lands exactly where it exports — that is the whole reason the mapping was
 * pulled out into `charting/geometry` in the first place.
 *
 * It is deliberately NOT a copy of the template's layout. Reproducing the
 * card's padding, gutter and safe areas would create a second layout to keep in
 * sync forever, and every drift would be a shape that moves between build and
 * export. Only price and bar index cross the boundary, and those are exact.
 */

import { useMemo, useRef, useState } from "react";
import {
  priceScale,
  priceToSvgY,
  indexToSvgX,
  slotWidth,
  snapIndex,
  smoothPathD,
  smoothPrice,
  snapPrice,
  svgXToIndex,
  svgYToPrice,
  type Bar,
  type PriceScale,
} from "@engine/charting/geometry";
import { annotationPrices } from "@engine/charting/annotations";
import { useEditing, setPicking, setSelected } from "./editing";

type Point = { index: number; price: number };
type Annotation = Record<string, unknown> & { id: string; kind: string };

const ACCENT = "#7C5CFF";
const UP = "#22c55e";
const DOWN = "#ef4444";

/** What a handle drags. A zone's edge is a price; a focus edge is a candle. */
type Axis = "both" | "price" | "index";

type Handle = {
  key: string;
  index: number;
  price: number;
  axis: Axis;
  title: string;
  /** The change this handle makes when dropped at `p`. */
  apply: (p: Point) => Record<string, unknown>;
  /**
   * The change that deletes this handle's point, where deleting one is
   * meaningful. A zone has exactly two edges and neither can be removed; a
   * projection path is a list, and a list you can only add to is a trap.
   */
  remove?: () => Record<string, unknown>;
};

const num = (v: unknown, fallback = 0) =>
  typeof v === "number" && Number.isFinite(v) ? v : fallback;

const pointOf = (v: unknown): Point => {
  const p = (v ?? {}) as Partial<Point>;
  return { index: num(p.index), price: num(p.price) };
};

/**
 * Every draggable point on one annotation.
 *
 * Driving this off a description rather than a branch per shape in the drag
 * code is what keeps the interaction identical everywhere: one handle renderer,
 * one drag path, one snapping rule. Adding a shape means adding its handles,
 * not another special case in the pointer handling.
 */
const handlesFor = (a: Annotation, s: PriceScale): Handle[] => {
  // Price-only handles still need somewhere to sit horizontally. Three-quarters
  // along keeps them clear of the candles and off the right-hand edge.
  const restIndex = Math.max(0, s.count * 0.75);
  const midPrice = (s.lo + s.hi) / 2;

  switch (a.kind) {
    case "zone":
      return [
        {
          key: "to",
          index: restIndex,
          price: num(a.to),
          axis: "price",
          title: "Upper price",
          apply: (p) => ({ to: p.price }),
        },
        {
          key: "from",
          index: restIndex,
          price: num(a.from),
          axis: "price",
          title: "Lower price",
          apply: (p) => ({ from: p.price }),
        },
      ];

    case "level":
      return [
        {
          key: "price",
          index: restIndex,
          price: num(a.price),
          axis: "price",
          title: "Price",
          apply: (p) => ({ price: p.price }),
        },
      ];

    case "trendline":
    case "arrow":
    case "fib": {
      const a1 = pointOf(a.a);
      const b1 = pointOf(a.b);
      return [
        { key: "a", ...a1, axis: "both", title: "Start", apply: (p) => ({ a: p }) },
        { key: "b", ...b1, axis: "both", title: "End", apply: (p) => ({ b: p }) },
      ];
    }

    case "channel": {
      const a1 = pointOf(a.a);
      const b1 = pointOf(a.b);
      return [
        { key: "a", ...a1, axis: "both", title: "Start", apply: (p) => ({ a: p }) },
        { key: "b", ...b1, axis: "both", title: "End", apply: (p) => ({ b: p }) },
        {
          // The parallel line, dragged where it actually is rather than typed as
          // a price difference — "channel width 0.0042" means nothing on sight.
          key: "offset",
          index: a1.index,
          price: a1.price + num(a.offset),
          axis: "price",
          title: "Parallel line",
          apply: (p) => ({ offset: p.price - a1.price }),
        },
      ];
    }

    case "note":
      return [
        {
          key: "at",
          ...pointOf(a.at),
          axis: "both",
          title: "Position",
          apply: (p) => ({ at: p }),
        },
      ];

    case "vline":
      return [
        {
          key: "index",
          index: num(a.index),
          price: midPrice,
          axis: "index",
          title: "Candle",
          apply: (p) => ({ index: p.index }),
        },
      ];

    case "focus":
      return [
        {
          key: "fromIndex",
          index: num(a.fromIndex),
          price: midPrice,
          axis: "index",
          title: "First candle",
          apply: (p) => ({ fromIndex: p.index }),
        },
        {
          key: "toIndex",
          index: num(a.toIndex),
          price: midPrice,
          axis: "index",
          title: "Last candle",
          apply: (p) => ({ toIndex: p.index }),
        },
      ];

    case "position": {
      const from = num(a.fromIndex);
      const to = num(a.toIndex);
      const mid = (from + to) / 2;
      return [
        {
          key: "entry",
          index: mid,
          price: num(a.entry),
          axis: "price",
          title: "Entry",
          apply: (p) => ({ entry: p.price }),
        },
        {
          key: "stop",
          index: mid,
          price: num(a.stop),
          axis: "price",
          title: "Stop",
          apply: (p) => ({ stop: p.price }),
        },
        {
          key: "target",
          index: mid,
          price: num(a.target),
          axis: "price",
          title: "Target",
          apply: (p) => ({ target: p.price }),
        },
        {
          key: "fromIndex",
          index: from,
          price: num(a.entry),
          axis: "index",
          title: "First candle",
          apply: (p) => ({ fromIndex: p.index }),
        },
        {
          key: "toIndex",
          index: to,
          price: num(a.entry),
          axis: "index",
          title: "Last candle",
          apply: (p) => ({ toIndex: p.index }),
        },
      ];
    }

    case "projection": {
      const pts = (a.points as Point[]) ?? [];
      return pts.map((pt, n) => ({
        key: `points.${n}`,
        index: num(pt.index),
        price: num(pt.price),
        axis: "both" as Axis,
        title: `Point ${n + 1}`,
        apply: (p: Point) => ({
          points: pts.map((old, m) => (m === n ? p : old)),
        }),
        remove: () => ({ points: pts.filter((_, m) => m !== n) }),
      }));
    }

    default:
      return [];
  }
};

/* ------------------------------------------------------------------ *
 * Drawing
 * ------------------------------------------------------------------ */

/**
 * The annotation as geometry.
 *
 * A rough likeness on purpose. This is the working view — its job is to show
 * where a shape sits and what its handles do, not to be a second renderer that
 * can disagree with the first one. For how it will actually look, switch to
 * Preview; that is the point of having two states.
 */
const Shape: React.FC<{
  a: Annotation;
  s: PriceScale;
  bars: Bar[];
  active: boolean;
}> = ({ a, s, bars, active }) => {
  const colour = typeof a.color === "string" && a.color ? a.color : ACCENT;
  const alpha = active ? 1 : 0.75;
  const w = active ? 2 : 1.4;
  const line = {
    stroke: colour,
    strokeWidth: w,
    strokeOpacity: alpha,
    vectorEffect: "non-scaling-stroke" as const,
    fill: "none",
  };
  const x = (i: number) => indexToSvgX(i, s);
  const y = (p: number) => priceToSvgY(p, s);

  switch (a.kind) {
    case "zone": {
      const top = y(Math.max(num(a.from), num(a.to)));
      const bottom = y(Math.min(num(a.from), num(a.to)));
      return (
        <>
          <rect
            x={0}
            y={top}
            width={100}
            height={Math.max(bottom - top, 0.3)}
            fill={colour}
            fillOpacity={0.16 * alpha}
          />
          <line x1={0} y1={top} x2={100} y2={top} {...line} />
          <line x1={0} y1={bottom} x2={100} y2={bottom} {...line} />
        </>
      );
    }

    case "level":
      return (
        <line
          x1={0}
          y1={y(num(a.price))}
          x2={100}
          y2={y(num(a.price))}
          {...line}
          strokeDasharray={a.style === "solid" ? undefined : "4 3"}
        />
      );

    case "vline":
      return (
        <line
          x1={x(num(a.index))}
          y1={0}
          x2={x(num(a.index))}
          y2={100}
          {...line}
          strokeDasharray={a.style === "solid" ? undefined : "4 3"}
        />
      );

    case "trendline":
    case "arrow": {
      const p = pointOf(a.a);
      const q = pointOf(a.b);
      return (
        <>
          <line x1={x(p.index)} y1={y(p.price)} x2={x(q.index)} y2={y(q.price)} {...line} />
          {a.kind === "arrow" ? (
            <circle cx={x(q.index)} cy={y(q.price)} r={1.4} fill={colour} fillOpacity={alpha} />
          ) : null}
        </>
      );
    }

    case "channel": {
      const p = pointOf(a.a);
      const q = pointOf(a.b);
      const off = num(a.offset);
      return (
        <>
          <path
            d={`M ${x(p.index)} ${y(p.price)} L ${x(q.index)} ${y(q.price)} L ${x(q.index)} ${y(q.price + off)} L ${x(p.index)} ${y(p.price + off)} Z`}
            fill={colour}
            fillOpacity={0.12 * alpha}
            stroke="none"
          />
          <line x1={x(p.index)} y1={y(p.price)} x2={x(q.index)} y2={y(q.price)} {...line} />
          <line
            x1={x(p.index)}
            y1={y(p.price + off)}
            x2={x(q.index)}
            y2={y(q.price + off)}
            {...line}
          />
        </>
      );
    }

    case "fib": {
      const p = pointOf(a.a);
      const q = pointOf(a.b);
      const levels = (a.levels as number[]) ?? [0, 0.382, 0.5, 0.618, 1];
      return (
        <>
          {levels.map((l, n) => {
            const price = p.price + (q.price - p.price) * l;
            return (
              <line
                key={n}
                x1={x(p.index)}
                y1={y(price)}
                x2={x(q.index)}
                y2={y(price)}
                {...line}
                strokeWidth={w * 0.7}
              />
            );
          })}
        </>
      );
    }

    case "focus": {
      const from = x(num(a.fromIndex) - 0.5);
      const to = x(num(a.toIndex) + 0.5);
      return (
        <>
          {/* The dim is on everything ELSE, so the build view shows it that way
              too — a box around the candles would read as the opposite. */}
          <rect x={0} y={0} width={Math.max(from, 0)} height={100} fill="#0b0f16" fillOpacity={0.5} />
          <rect x={to} y={0} width={Math.max(100 - to, 0)} height={100} fill="#0b0f16" fillOpacity={0.5} />
          <line x1={from} y1={0} x2={from} y2={100} {...line} />
          <line x1={to} y1={0} x2={to} y2={100} {...line} />
        </>
      );
    }

    case "position": {
      const from = x(num(a.fromIndex) - 0.5);
      const to = x(num(a.toIndex) + 0.5);
      const width = Math.max(to - from, 0.5);
      const entry = y(num(a.entry));
      const stop = y(num(a.stop));
      const target = y(num(a.target));
      return (
        <>
          <rect
            x={from}
            y={Math.min(entry, target)}
            width={width}
            height={Math.abs(target - entry)}
            fill={UP}
            fillOpacity={0.16 * alpha}
          />
          <rect
            x={from}
            y={Math.min(entry, stop)}
            width={width}
            height={Math.abs(stop - entry)}
            fill={DOWN}
            fillOpacity={0.16 * alpha}
          />
          <line x1={from} y1={entry} x2={to} y2={entry} {...line} />
        </>
      );
    }

    case "projection": {
      const pts = ((a.points as Point[]) ?? []).filter(Boolean);
      if (!pts.length) return null;
      const sorted = [...pts].sort((p, q) => p.index - q.index);
      return (
        <>
          {a.showPath !== false && pts.length > 1 ? (
            // The same curve the render draws, from the same function — a
            // straight-segment preview of a smoothed path would put the bends
            // somewhere they don't end up.
            <path
              d={smoothPathD(
                smoothPrice(sorted),
                sorted[0].index,
                sorted[sorted.length - 1].index,
                s,
              )}
              {...line}
            />
          ) : null}
        </>
      );
    }

    default:
      return null;
  }
};

/* ------------------------------------------------------------------ */

export const BuildStage: React.FC<{
  bars: Bar[];
  futureBars: number;
  annotations: Annotation[];
  onChange: (next: Annotation[]) => void;
}> = ({ bars, futureBars, annotations, onChange }) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const { picking, selected } = useEditing();

  /**
   * Which handle the pointer is holding, and whether it has actually moved.
   *
   * Refs, not state. Held in state, the pointermove handler reads whatever
   * `drag` was when its render happened — and pointerdown's re-render has not
   * landed yet, so the first move of every drag is dropped. It is one frame,
   * but it is the frame where a short drag lives, so a small nudge did nothing
   * at all. A ref is current the instant it is written.
   */
  const drag = useRef<{ row: number; key: string } | null>(null);
  const moved = useRef(false);

  const scale = useMemo(
    () =>
      priceScale(
        bars,
        // Annotation prices must be inside the visible range or a zone above the
        // high renders off-frame — the same call the template makes.
        annotationPrices(annotations as never) ?? [],
        0.08,
        futureBars,
      ),
    [bars, annotations, futureBars],
  );

  const slot = slotWidth(scale);
  const bodyW = Math.max(slot * 0.62, 0.05);

  /** Client coordinates → a snapped point on the chart. */
  const pointAt = (clientX: number, clientY: number): Point | null => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || !rect.width || !rect.height) return null;
    const px = ((clientX - rect.left) / rect.width) * 100;
    const py = ((clientY - rect.top) / rect.height) * 100;
    const rawIndex = svgXToIndex(px, scale);
    const rawPrice = svgYToPrice(py, scale);
    return {
      index: snapIndex(rawIndex, scale),
      price: Number(snapPrice(rawPrice, bars, scale, { index: rawIndex }).toFixed(6)),
    };
  };

  const patch = (row: number, changes: Record<string, unknown>) =>
    onChange(annotations.map((a, n) => (n === row ? { ...a, ...changes } : a)));

  /* --------------------------- dragging --------------------------- */

  const onPointerDown = (row: number, key: string) => (e: React.PointerEvent) => {
    e.stopPropagation();
    // Capturing on the SVG, not the handle: a fast drag leaves a 4px circle
    // behind long before the pointer stops, and the move events have to keep
    // arriving at something. Capture is an optimisation, not a requirement —
    // if the pointer has already gone the drag should still start rather than
    // throw out of the handler.
    try {
      svgRef.current?.setPointerCapture(e.pointerId);
    } catch {
      /* no capture available; moves still arrive while over the SVG */
    }
    moved.current = false;
    drag.current = { row, key };
    setSelected(annotations[row]?.id ?? null);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const held = drag.current;
    if (!held) return;
    const p = pointAt(e.clientX, e.clientY);
    if (!p) return;
    const a = annotations[held.row];
    if (!a) return;
    const handle = handlesFor(a, scale).find((h) => h.key === held.key);
    if (!handle) return;
    moved.current = true;
    // A price-only handle that also moved sideways would silently rewrite a
    // field the handle isn't for, so each axis keeps whatever it started with.
    const next: Point = {
      index: handle.axis === "price" ? handle.index : p.index,
      price: handle.axis === "index" ? handle.price : p.price,
    };
    patch(held.row, handle.apply(next));
  };

  const endDrag = (e: React.PointerEvent) => {
    if (!drag.current) return;
    try {
      svgRef.current?.releasePointerCapture(e.pointerId);
    } catch {
      /* never captured */
    }
    drag.current = null;
  };

  /* ---------------------------- clicking --------------------------- */

  const onClick = (e: React.MouseEvent) => {
    // Letting go of a handle is also a click. Without this, every drag ended by
    // placing a stray point wherever the drag finished.
    if (moved.current) {
      moved.current = false;
      return;
    }

    const p = pointAt(e.clientX, e.clientY);
    if (!p) return;

    if (picking) {
      const a = annotations[picking.row];
      if (!a) return setPicking(null);

      if (picking.field === "points") {
        // A path is built by clicking along it, so this stays armed. Every other
        // field is one value and disarms once it has it.
        const pts = (a.points as Point[]) ?? [];
        patch(picking.row, { points: [...pts, p] });
        return;
      }
      if (picking.field === "a" || picking.field === "b" || picking.field === "at") {
        patch(picking.row, { [picking.field]: p });
      } else {
        patch(picking.row, { [picking.field]: p.price });
      }
      setPicking(null);
      return;
    }

    /*
      Nothing armed, but a projection is selected — clicking extends its path.
      Selecting a shape and clicking the chart has one obvious meaning, and
      making people arm a field first to do the obvious thing is the friction
      that made this feature feel broken.
    */
    const row = annotations.findIndex((a) => a.id === selected);
    const a = annotations[row];
    if (a?.kind === "projection") {
      const pts = (a.points as Point[]) ?? [];
      patch(row, { points: [...pts, p] });
    }
  };

  /* ---------------------------- rendering -------------------------- */

  const selectedRow = annotations.findIndex((a) => a.id === selected);
  const selectedAnnotation = annotations[selectedRow];

  const hint = picking
    ? `Click the chart to set the ${picking.label}${picking.field === "points" ? " — keep clicking to extend the path" : ""}`
    : selectedAnnotation?.kind === "projection"
      ? "Click the chart to add points to the path · drag any point to move it"
      : selectedAnnotation
        ? "Drag the handles to move it"
        : "Select a shape in the panel, or drag a handle";

  return (
    <div className="build">
      <div className="build-bar">
        <span className="small">{hint}</span>
        {picking ? (
          <button className="link" onClick={() => setPicking(null)}>
            Done
          </button>
        ) : null}
      </div>

      <div className="build-canvas-wrap">
        <svg
          ref={svgRef}
          className={`build-canvas${picking ? " arming" : ""}`}
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onClick={onClick}
        >
          {bars.map((bar, i) => {
            const cx = indexToSvgX(i, scale);
            const top = priceToSvgY(Math.max(bar.open, bar.close), scale);
            const h = Math.max(
              priceToSvgY(Math.min(bar.open, bar.close), scale) - top,
              0.3,
            );
            const up = bar.close >= bar.open;
            return (
              <g key={i} opacity={0.9}>
                <line
                  x1={cx}
                  y1={priceToSvgY(bar.high, scale)}
                  x2={cx}
                  y2={priceToSvgY(bar.low, scale)}
                  stroke={up ? UP : DOWN}
                  strokeWidth={0.6}
                  vectorEffect="non-scaling-stroke"
                />
                <rect x={cx - bodyW / 2} y={top} width={bodyW} height={h} fill={up ? UP : DOWN} />
              </g>
            );
          })}

          {/* Where history stops and the reserved gap begins. */}
          {futureBars > 0 ? (
            <line
              x1={indexToSvgX(bars.length - 0.5, scale)}
              y1={0}
              x2={indexToSvgX(bars.length - 0.5, scale)}
              y2={100}
              stroke="#8b97a8"
              strokeWidth={1}
              strokeDasharray="3 3"
              vectorEffect="non-scaling-stroke"
            />
          ) : null}

          {annotations.map((a, row) => (
            <g key={a.id ?? row}>
              <Shape a={a} s={scale} bars={bars} active={row === selectedRow} />
            </g>
          ))}

          {/*
            Handles last so they sit above every shape — a handle underneath a
            zone's fill is a handle you cannot grab.
          */}
          {annotations.map((a, row) =>
            handlesFor(a, scale).map((h) => {
              const on = row === selectedRow;
              return (
                <circle
                  key={`${a.id}-${h.key}`}
                  className="build-handle"
                  cx={indexToSvgX(h.index, scale)}
                  cy={priceToSvgY(h.price, scale)}
                  // Unselected shapes keep small handles: visible enough to grab
                  // directly, quiet enough not to speckle the whole chart.
                  r={on ? 1.5 : 0.9}
                  fill={on ? "#fff" : (a.color as string) || ACCENT}
                  stroke={(a.color as string) || ACCENT}
                  strokeWidth={on ? 2 : 1}
                  vectorEffect="non-scaling-stroke"
                  onPointerDown={onPointerDown(row, h.key)}
                  onContextMenu={
                    h.remove
                      ? (e) => {
                          // Right-click, because left is already taken by drag
                          // and by placing the next point — and a point you can
                          // add but never take back is worse than no point.
                          e.preventDefault();
                          e.stopPropagation();
                          patch(row, h.remove!());
                        }
                      : undefined
                  }
                >
                  <title>
                    {`${a.kind} — ${h.title}${h.remove ? " (right-click to remove)" : ""}`}
                  </title>
                </circle>
              );
            }),
          )}
        </svg>

        {/*
          Labels in HTML, not SVG. `preserveAspectRatio="none"` stretches the
          box to the stage, and it stretches text with it — a wide stage gives
          letters twice the width they should have.
        */}
        <div className="build-labels">
          {annotations.map((a, row) => {
            const first = handlesFor(a, scale)[0];
            if (!first || !a.label) return null;
            return (
              <button
                key={a.id ?? row}
                className={`build-label${row === selectedRow ? " on" : ""}`}
                style={{
                  left: `${Math.max(2, Math.min(94, indexToSvgX(first.index, scale)))}%`,
                  top: `${Math.max(1, Math.min(96, priceToSvgY(first.price, scale)))}%`,
                  borderColor: (a.color as string) || ACCENT,
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  setSelected(a.id);
                }}
              >
                {String(a.label)}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
