/**
 * SCHEMA INTROSPECTION — the single place that reads Zod internals.
 *
 * Two consumers:
 *   - SchemaForm renders controls from these field kinds
 *   - promptToProps converts the same kinds into a Gemini response schema
 *
 * Both must agree: if the form can edit a field, the model must be able to fill
 * it, and vice versa. Keeping one introspector is what guarantees that.
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
  | { kind: "objectArray"; columns: { key: string; int: boolean }[] }
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
        columns: Object.keys(shape).map((key) => ({
          key,
          int: numberChecks(unwrap(shape[key])).int,
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

  return Object.entries(shape).map(([key, field]) => {
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

/* ------------------------------------------------------------------ *
 * Gemini response schema
 * ------------------------------------------------------------------ */

/**
 * Converts a template schema into the subset of JSON Schema Gemini accepts
 * (an OpenAPI 3.0 flavour: type / description / enum / items / properties).
 *
 * Deliberately hand-rolled rather than using zod-to-json-schema: that library
 * needs a newer Zod than Remotion pins, and it emits constructs Gemini rejects
 * ($ref, anyOf, additionalProperties). This emits only what the API takes.
 *
 * Every property is optional. The model returns a PATCH — just the fields the
 * request implies — which is then merged over the current props. That way a
 * prompt about the price can't silently blank the ticker.
 */
export const toGeminiSchema = (schema: any, labels?: Record<string, string>) => {
  const properties: Record<string, unknown> = {};

  for (const field of fieldEntries(schema, labels)) {
    const { key, kind, label } = field;

    if (kind.kind === "string") {
      properties[key] = {
        type: "string",
        description: kind.maxLength
          ? `${label} (max ${kind.maxLength} characters)`
          : label,
      };
    } else if (kind.kind === "color") {
      properties[key] = {
        type: "string",
        description: `${label}. A hex colour like #22C55E.`,
      };
    } else if (kind.kind === "number") {
      const range =
        kind.min !== undefined && kind.max !== undefined
          ? ` Between ${kind.min} and ${kind.max}.`
          : "";
      properties[key] = {
        type: kind.int ? "integer" : "number",
        description: `${label}.${range}`,
      };
    } else if (kind.kind === "boolean") {
      properties[key] = { type: "boolean", description: label };
    } else if (kind.kind === "enum") {
      properties[key] = { type: "string", enum: kind.values, description: label };
    } else if (kind.kind === "objectArray") {
      properties[key] = {
        type: "array",
        description: label,
        items: {
          type: "object",
          properties: Object.fromEntries(
            kind.columns.map((c) => [
              c.key,
              { type: c.int ? "integer" : "number" },
            ]),
          ),
          required: kind.columns.map((c) => c.key),
        },
      };
    }
    // Unsupported kinds are simply omitted — the model can't fill what the
    // form can't show, which keeps the two in sync by construction.
  }

  return { type: "object", properties };
};
