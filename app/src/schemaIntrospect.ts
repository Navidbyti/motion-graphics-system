/**
 * SCHEMA INTROSPECTION — the single place that reads Zod internals.
 *
 * Two consumers:
 *   - SchemaForm renders controls from these field kinds
 *   - the template contract shown to editors lists the same fields
 *
 * Keeping one introspector means the form and any generated documentation can
 * never disagree about what a template accepts.
 *
 * Zod v3 `_def` is private API, so it is fenced into this file. A Zod upgrade
 * breaks only here.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

export type FieldKind =
  | { kind: "color" }
  | { kind: "string"; maxLength?: number }
  | { kind: "number"; min?: number; max?: number; int: boolean }
  | { kind: "boolean" }
  | { kind: "enum"; values: string[] }
  | {
      kind: "objectArray";
      columns: { key: string; int: boolean; text: boolean }[];
      minItems?: number;
      maxItems?: number;
    }
  | { kind: "unsupported" };

/** Strips wrappers that don't change how a field is edited. */
const unwrap = (schema: any): any => {
  let s = schema;
  // ZodEffects carrying the Remotion colour marker must NOT be unwrapped —
  // the marker lives on the wrapper's description.
  while (
    s?._def?.typeName === "ZodOptional" ||
    s?._def?.typeName === "ZodDefault" ||
    (s?._def?.typeName === "ZodEffects" && s.description !== "__remotion-color")
  ) {
    s = s._def.innerType ?? s._def.schema;
  }
  return s;
};

const numberChecks = (s: any) => {
  const checks: any[] = s?._def?.checks ?? [];
  return {
    min: checks.find((c) => c.kind === "min")?.value,
    max: checks.find((c) => c.kind === "max")?.value,
    int: checks.some((c) => c.kind === "int"),
  };
};

export const inspect = (schema: any): FieldKind => {
  // Colour is detected before unwrapping: zColor() is a ZodEffects whose
  // description slot holds the marker.
  if (schema?.description === "__remotion-color") return { kind: "color" };

  const s = unwrap(schema);
  const t = s?._def?.typeName;

  if (t === "ZodString") {
    const max = (s._def.checks ?? []).find((c: any) => c.kind === "max")?.value;
    return { kind: "string", maxLength: max };
  }
  if (t === "ZodNumber") return { kind: "number", ...numberChecks(s) };
  if (t === "ZodBoolean") return { kind: "boolean" };
  if (t === "ZodEnum") return { kind: "enum", values: s._def.values };
  if (t === "ZodArray") {
    const inner = unwrap(s._def.type);
    if (inner?._def?.typeName === "ZodObject") {
      const shape = inner._def.shape();
      return {
        kind: "objectArray",
        // Row limits come from the schema, never from the form. They were
        // hardcoded in both places and drifted: the schema allowed 60 candles
        // and so did the form, but raising one without the other either caps
        // the editor below what renders or lets him build data the template
        // rejects.
        minItems: s._def.minLength?.value,
        maxItems: s._def.maxLength?.value,
        columns: Object.keys(shape).map((key) => ({
          key,
          int: numberChecks(unwrap(shape[key])).int,
          // Every column used to be assumed numeric, which silently broke the
          // line chart: its points carry a string axis label, and editing any
          // cell ran the label through Number() and wrote NaN.
          text: unwrap(shape[key])?._def?.typeName === "ZodString",
        })),
      };
    }
  }
  return { kind: "unsupported" };
};

/** "bullColor" → "Bull Color"-ish. Last-resort label. */
export const humanise = (key: string) =>
  key
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (c) => c.toUpperCase())
    .trim();

export type FieldEntry = {
  key: string;
  kind: FieldKind;
  label: string;
  /** Raw describe() text, absent on colour fields. Used to brief the model. */
  description?: string;
};

/**
 * Flattens a template schema into fields with resolved labels.
 * Label priority: explicit `labels` map → `.describe()` text → humanised key.
 * Colour fields can never carry a description, which is why the map exists.
 */
export const fieldEntries = (
  schema: any,
  labels?: Record<string, string>,
): FieldEntry[] => {
  const shape = schema?._def?.shape?.();
  if (!shape) return [];

  return Object.entries(shape)
    .filter(([, field]) => {
      // Fields the app supplies rather than the editor edits — the custom theme
      // comes from Settings, not from the props panel. Same marker convention
      // zColor() uses to flag its own field type.
      return (field as any)?.description !== "__app-managed";
    })
    .map(([key, field]) => {
    const raw = (field as any)?.description;
    const description = raw === "__remotion-color" ? undefined : raw;
    return {
      key,
      kind: inspect(field),
      label: labels?.[key] ?? description ?? humanise(key),
      description,
    };
  });
};
