/**
 * Editor for the chart's annotation list.
 *
 * The generated form cannot build this one: every other field is a single Zod
 * type, but an annotation is a discriminated union where the fields depend on
 * which shape it is. Without this the list rendered as "no editor for this
 * field type" — the zones were visible in the preview and impossible to delete.
 *
 * This is now the numbers half of the interface. Placing shapes happens on the
 * stage in Build mode, where you can see the chart; the "pick" links here
 * switch to it and arm the field. Both halves stay, because typing an exact
 * level you already know is faster than aiming at it, and dragging a shape into
 * place is faster than guessing at a number.
 */

import { useState } from "react";
import { setPicking, setSelected, useEditing } from "./editing";

type Point = { index: number; price: number };
type Annotation = Record<string, unknown> & { id: string; kind: string };

/** Which numeric fields each shape shows, and what to call them. */
const FIELDS: Record<string, { key: string; label: string; step?: number }[]> = {
  zone: [
    { key: "to", label: "Upper price" },
    { key: "from", label: "Lower price" },
  ],
  level: [{ key: "price", label: "Price" }],
  focus: [
    { key: "fromIndex", label: "First candle", step: 1 },
    { key: "toIndex", label: "Last candle", step: 1 },
    { key: "dim", label: "Dim the rest", step: 0.05 },
  ],
  vline: [{ key: "index", label: "Candle", step: 1 }],
  position: [
    { key: "entry", label: "Entry" },
    { key: "stop", label: "Stop" },
    { key: "target", label: "Target" },
    { key: "fromIndex", label: "First candle", step: 1 },
    { key: "toIndex", label: "Last candle", step: 1 },
  ],
  channel: [{ key: "offset", label: "Channel width (price)" }],
};

/** Shapes defined by two points on the chart. */
const TWO_POINT = new Set(["trendline", "channel", "arrow", "fib"]);
const ONE_POINT = new Set(["note"]);

const KINDS = [
  ["zone", "Zone — a price band"],
  ["level", "Level — one horizontal line"],
  ["trendline", "Trendline"],
  ["channel", "Channel — parallel lines"],
  ["arrow", "Arrow"],
  ["note", "Note — text on the chart"],
  ["vline", "Vertical line"],
  ["focus", "Focus — dim everything else"],
  ["fib", "Fibonacci retracement"],
  ["projection", "Projection — predicted candles"],
  ["position", "Position — entry, stop, target"],
] as const;

/** A sensible new annotation, placed in the middle of whatever is on screen. */
const blank = (kind: string, midPrice: number, midIndex: number): Annotation => {
  const base = { id: `${kind}-${Date.now().toString(36)}`, kind, opacity: 0.55 };
  const a = { index: Math.round(midIndex * 0.6), price: midPrice * 0.98 };
  const b = { index: Math.round(midIndex * 1.3), price: midPrice * 1.02 };

  switch (kind) {
    case "zone":
      return { ...base, from: midPrice * 0.99, to: midPrice * 1.01 };
    case "level":
      return { ...base, price: midPrice, style: "dashed" };
    case "trendline":
      return { ...base, a, b, style: "solid", extend: false };
    case "channel":
      return { ...base, a, b, offset: midPrice * 0.02, extend: false };
    case "arrow":
      return { ...base, a, b };
    case "note":
      return { ...base, at: { index: Math.round(midIndex), price: midPrice }, label: "Note" };
    case "vline":
      return { ...base, index: Math.round(midIndex), style: "dashed" };
    case "focus":
      return {
        ...base,
        fromIndex: Math.round(midIndex * 0.7),
        toIndex: Math.round(midIndex * 1.1),
        dim: 0.72,
      };
    case "fib":
      return { ...base, a, b, levels: [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1] };
    case "projection":
      return { ...base, points: [], showPath: true, showCandles: true, volatility: 0.5 };
    case "position":
      return {
        ...base,
        entry: midPrice,
        stop: midPrice * 0.99,
        target: midPrice * 1.02,
        fromIndex: Math.round(midIndex * 0.8),
        toIndex: Math.round(midIndex * 1.2),
      };
    default:
      return base;
  }
};

export const AnnotationEditor: React.FC<{
  value: Annotation[];
  /**
   * `removedId` is passed on delete so the caller can drop that annotation's
   * beat in the SAME update. Two separate updates lose one of the two changes.
   */
  onChange: (v: Annotation[], removedId?: string) => void;
  /** Used to place new shapes somewhere visible rather than at zero. */
  bars: { open: number; high: number; low: number; close: number }[];
  /** Empty slots at the right, so new shapes land where they render. */
  futureBars?: number;
}> = ({ value, onChange, bars }) => {
  const [adding, setAdding] = useState("zone");

  /*
    Which field is waiting for a click, and which shape is highlighted. Shared
    with the stage rather than held here: the click that answers lands over
    there, on a component this one does not contain.
  */
  const { picking, selected } = useEditing();

  const prices = bars.flatMap((b) => [b.high, b.low]);
  const midPrice = prices.length
    ? (Math.min(...prices) + Math.max(...prices)) / 2
    : 100;
  const midIndex = Math.max(bars.length - 1, 1) / 2;

  /**
   * Send this field to the stage and wait for a click there.
   *
   * Selecting first, then arming: `setSelected` clears any armed field, since
   * changing which shape you are working on has to invalidate a click aimed at
   * the last one. Doing it the other way round disarms what we just armed.
   */
  const arm = (i: number, field: string, label: string) => {
    setSelected(value[i]?.id ?? null);
    setPicking({ row: i, field, label });
  };

  const armed = (i: number, field: string) =>
    picking?.row === i && picking.field === field;

  const patch = (i: number, changes: Record<string, unknown>) =>
    onChange(value.map((a, n) => (n === i ? { ...a, ...changes } : a)));

  const patchPoint = (i: number, key: string, part: Partial<Point>) => {
    const current = (value[i][key] ?? { index: 0, price: 0 }) as Point;
    patch(i, { [key]: { ...current, ...part } });
  };

  const remove = (i: number) => {
    // The beat sheet points at ids, so a deleted shape leaves a beat aimed at
    // nothing. Both changes go out together.
    onChange(value.filter((_, n) => n !== i), value[i].id);
  };

  const move = (i: number, by: number) => {
    const to = i + by;
    if (to < 0 || to >= value.length) return;
    const next = [...value];
    [next[i], next[to]] = [next[to], next[i]];
    onChange(next);
  };

  return (
    <div className="annots">
      {value.map((a, i) => {
        const numeric = FIELDS[a.kind] ?? [];
        return (
          <div
            className={`annot${a.id === selected ? " on" : ""}`}
            key={a.id ?? i}
            // Clicking a card is how you choose what the stage puts handles on.
            onClick={() => setSelected(a.id)}
          >
            <div className="row-between annot-head">
              <strong className="small">
                {KINDS.find((k) => k[0] === a.kind)?.[1].split(" — ")[0] ?? a.kind}
              </strong>
              <div className="btn-group">
                {/* Order is drawing order — later items sit on top. */}
                <button className="link" onClick={() => move(i, -1)} title="Send back">
                  ↑
                </button>
                <button className="link" onClick={() => move(i, 1)} title="Bring forward">
                  ↓
                </button>
                <button className="link annot-del" onClick={() => remove(i)} title="Delete">
                  ✕
                </button>
              </div>
            </div>

            <div className="annot-grid">
              {numeric.map((f) => (
                <label className="field" key={f.key}>
                  <span className="field-label">
                    {f.label}
                    {/* Numbers stay — the picker is an alternative, not a
                        replacement. Typing an exact level is still the fastest
                        way to enter one you already know. */}
                    {f.step !== 1 ? (
                      <button
                        className={`link pick${armed(i, f.key) ? " on" : ""}`}
                        onClick={() => arm(i, f.key, f.label)}
                      >
                        {armed(i, f.key) ? "click the chart…" : "pick"}
                      </button>
                    ) : null}
                  </span>
                  <input
                    type="number"
                    step={f.step ?? "any"}
                    value={String(a[f.key] ?? 0)}
                    onChange={(e) => patch(i, { [f.key]: Number(e.target.value) })}
                  />
                </label>
              ))}

              {(TWO_POINT.has(a.kind) ? ["a", "b"] : ONE_POINT.has(a.kind) ? ["at"] : []).map(
                (pk) => {
                  const p = (a[pk] ?? { index: 0, price: 0 }) as Point;
                  return (
                    <div className="annot-point" key={pk}>
                      <span className="field-label">
                        {pk === "a" ? "Start" : pk === "b" ? "End" : "Position"}
                        <button
                          className={`link pick${armed(i, pk) ? " on" : ""}`}
                          onClick={() =>
                            arm(
                              i,
                              pk,
                              pk === "a" ? "start" : pk === "b" ? "end" : "position",
                            )
                          }
                        >
                          {armed(i, pk) ? "click the chart…" : "pick"}
                        </button>
                      </span>
                      <div className="annot-point-row">
                        <input
                          type="number"
                          step={1}
                          value={p.index}
                          title="Candle"
                          onChange={(e) =>
                            patchPoint(i, pk, { index: Number(e.target.value) })
                          }
                        />
                        <input
                          type="number"
                          step="any"
                          value={p.price}
                          title="Price"
                          onChange={(e) =>
                            patchPoint(i, pk, { price: Number(e.target.value) })
                          }
                        />
                      </div>
                    </div>
                  );
                },
              )}

              {a.kind === "projection" ? (
                <div className="annot-point" >
                  <span className="field-label">
                    Path — {((a.points as unknown[]) ?? []).length} points
                    <button
                      className={`link pick${armed(i, "points") ? " on" : ""}`}
                      onClick={() => arm(i, "points", "next point")}
                    >
                      {armed(i, "points") ? "click the chart…" : "click to add"}
                    </button>
                    <button
                      className="link"
                      onClick={() => patch(i, { points: [] })}
                    >
                      clear
                    </button>
                  </span>

                  <div className="annot-toggles">
                    <label className="annot-check">
                      <input
                        type="checkbox"
                        checked={a.showPath !== false}
                        onChange={(e) => patch(i, { showPath: e.target.checked })}
                      />
                      <span className="small">Path line</span>
                    </label>
                    <label className="annot-check">
                      <input
                        type="checkbox"
                        checked={a.showCandles !== false}
                        onChange={(e) => patch(i, { showCandles: e.target.checked })}
                      />
                      <span className="small">Candles</span>
                    </label>
                  </div>

                  <label className="field">
                    <span className="field-label">
                      Candle wick size — {Math.round(Number(a.volatility ?? 0.5) * 100)}%
                    </span>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.05}
                      value={Number(a.volatility ?? 0.5)}
                      onChange={(e) => patch(i, { volatility: Number(e.target.value) })}
                    />
                  </label>
                </div>
              ) : null}

              <label className="field">
                <span className="field-label">Label</span>
                <input
                  type="text"
                  value={String(a.label ?? "")}
                  onChange={(e) => patch(i, { label: e.target.value })}
                />
              </label>

              <label className="field">
                <span className="field-label">Colour</span>
                <div className="color-row">
                  <input
                    type="color"
                    value={String(a.color ?? "#4C8DFF")}
                    onChange={(e) => patch(i, { color: e.target.value })}
                  />
                  <button
                    className="link"
                    onClick={() => patch(i, { color: undefined })}
                    title="Follow the brand colour"
                  >
                    Brand
                  </button>
                </div>
              </label>

              <label className="field">
                <span className="field-label">
                  Transparency — {Math.round(Number(a.opacity ?? 0.55) * 100)}%
                </span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={Number(a.opacity ?? 0.55)}
                  onChange={(e) => patch(i, { opacity: Number(e.target.value) })}
                />
              </label>
            </div>
          </div>
        );
      })}

      <div className="annot-add">
        <select value={adding} onChange={(e) => setAdding(e.target.value)}>
          {KINDS.map(([id, label]) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </select>
        <button onClick={() => onChange([...value, blank(adding, midPrice, midIndex)])}>
          Add
        </button>
      </div>
    </div>
  );
};
