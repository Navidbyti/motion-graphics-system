/**
 * SCHEMA-DRIVEN PROPS FORM
 *
 * Reads a template's Zod schema and renders the whole editing UI from it. This
 * is why adding a template costs one registry entry: its controls come for free,
 * and they can't drift from what the component actually accepts.
 *
 * Zod v3 internals are read directly (`_def`). That's private API, so it's
 * fenced into this one file — if a Zod upgrade breaks introspection, only
 * `inspect()` needs fixing.
 */

import { useMemo, useState } from "react";
import type { z } from "zod";
import { fieldEntries, humanise } from "./schemaIntrospect";

/* ------------------------------------------------------------------ *
 * Table editor
 * ------------------------------------------------------------------ */

/**
 * Rows plus a paste box. The paste box is the point: the editor copies a block
 * of cells straight out of Excel or TradingView and the array fills itself.
 * Typing 40 candles by hand is not a workflow anybody sustains.
 */
const TableEditor: React.FC<{
  columns: { key: string; int: boolean }[];
  value: Record<string, number>[];
  onChange: (v: Record<string, number>[]) => void;
}> = ({ columns, value, onChange }) => {
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteError, setPasteError] = useState<string | null>(null);

  const applyPaste = (text: string) => {
    const rows = text
      .trim()
      .split(/\r?\n/)
      .map((line) => line.split(/\t|,|;/).map((c) => c.trim()))
      .filter((cells) => cells.some((c) => c !== ""));

    if (!rows.length) return setPasteError("Nothing to paste.");

    // Tolerate a header row by dropping any leading row that isn't numeric.
    const body = Number.isNaN(Number(rows[0][0])) ? rows.slice(1) : rows;
    const bad = body.find((cells) => cells.length < columns.length);
    if (bad) {
      return setPasteError(
        `Each row needs ${columns.length} values (${columns
          .map((c) => c.key)
          .join(", ")}). Found a row with ${bad.length}.`,
      );
    }

    const parsed = body.map((cells) =>
      Object.fromEntries(
        columns.map((col, i) => [col.key, Number(cells[i].replace(/[^0-9.-]/g, ""))]),
      ),
    );
    if (parsed.some((row) => Object.values(row).some((n) => Number.isNaN(n)))) {
      return setPasteError("Some values aren't numbers.");
    }

    setPasteError(null);
    setPasteOpen(false);
    onChange(parsed as Record<string, number>[]);
  };

  const setCell = (rowIndex: number, key: string, raw: string) => {
    const next = value.map((row, i) =>
      i === rowIndex ? { ...row, [key]: Number(raw) } : row,
    );
    onChange(next);
  };

  return (
    <div className="table-editor">
      <div className="row-between">
        <span className="muted">{value.length} rows</span>
        <div className="btn-group">
          <button onClick={() => setPasteOpen((o) => !o)}>Paste from sheet</button>
          <button
            onClick={() => onChange([...value, { ...value[value.length - 1] }])}
          >
            Add row
          </button>
          <button
            onClick={() => onChange(value.slice(0, -1))}
            disabled={value.length <= 2}
          >
            Remove
          </button>
        </div>
      </div>

      {pasteOpen ? (
        <div className="paste">
          <textarea
            rows={5}
            placeholder={`Paste columns in this order: ${columns
              .map((c) => c.key)
              .join(", ")}\nTab, comma or semicolon separated. A header row is fine.`}
            onChange={(e) => applyPaste(e.target.value)}
          />
          {pasteError ? <div className="error">{pasteError}</div> : null}
        </div>
      ) : null}

      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th className="idx">#</th>
              {columns.map((c) => (
                <th key={c.key}>{humanise(c.key)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {value.map((row, i) => (
              <tr key={i}>
                <td className="idx">{i + 1}</td>
                {columns.map((c) => (
                  <td key={c.key}>
                    <input
                      type="number"
                      value={row[c.key] ?? 0}
                      step={c.int ? 1 : "any"}
                      onChange={(e) => setCell(i, c.key, e.target.value)}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ *
 * Form
 * ------------------------------------------------------------------ */

export const SchemaForm: React.FC<{
  schema: z.ZodTypeAny;
  value: Record<string, unknown>;
  labels?: Record<string, string>;
  onChange: (next: Record<string, unknown>) => void;
}> = ({ schema, value, labels, onChange }) => {
  // Label resolution and field kinds both live in schemaIntrospect, shared with
  // promptToProps — so the model can always fill exactly what the form can edit.
  const fields = useMemo(() => fieldEntries(schema, labels), [schema, labels]);

  const set = (key: string, v: unknown) => onChange({ ...value, [key]: v });

  return (
    <div className="form">
      {fields.map(({ key, kind, label }) => (
        <label key={key} className="field">
          <span className="field-label">{label}</span>

          {kind.kind === "color" ? (
            <div className="color-row">
              <input
                type="color"
                value={String(value[key] ?? "#000000")}
                onChange={(e) => set(key, e.target.value)}
              />
              <input
                type="text"
                value={String(value[key] ?? "")}
                onChange={(e) => set(key, e.target.value)}
              />
            </div>
          ) : null}

          {kind.kind === "string" ? (
            <input
              type="text"
              maxLength={kind.maxLength}
              value={String(value[key] ?? "")}
              onChange={(e) => set(key, e.target.value)}
            />
          ) : null}

          {kind.kind === "number" ? (
            <div className="number-row">
              {kind.min !== undefined && kind.max !== undefined ? (
                <input
                  type="range"
                  min={kind.min}
                  max={kind.max}
                  step={kind.int ? 1 : (kind.max - kind.min) / 100}
                  value={Number(value[key] ?? 0)}
                  onChange={(e) => set(key, Number(e.target.value))}
                />
              ) : null}
              <input
                type="number"
                min={kind.min}
                max={kind.max}
                step={kind.int ? 1 : "any"}
                value={Number(value[key] ?? 0)}
                onChange={(e) => set(key, Number(e.target.value))}
              />
            </div>
          ) : null}

          {kind.kind === "boolean" ? (
            <input
              type="checkbox"
              checked={Boolean(value[key])}
              onChange={(e) => set(key, e.target.checked)}
            />
          ) : null}

          {kind.kind === "enum" ? (
            <select
              value={String(value[key] ?? "")}
              onChange={(e) => set(key, e.target.value)}
            >
              {kind.values.map((v) => (
                <option key={v} value={v}>
                  {humanise(v)}
                </option>
              ))}
            </select>
          ) : null}

          {kind.kind === "objectArray" ? (
            <TableEditor
              columns={kind.columns}
              value={(value[key] as Record<string, number>[]) ?? []}
              onChange={(v) => set(key, v)}
            />
          ) : null}

          {kind.kind === "unsupported" ? (
            <span className="error">
              No editor for this field type yet — add one in SchemaForm.tsx.
            </span>
          ) : null}
        </label>
      ))}
    </div>
  );
};
