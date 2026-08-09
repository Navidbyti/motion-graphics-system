/**
 * Declared fields → a Zod schema, so a pasted template gets the real form.
 *
 * The app already turns a Zod schema into a GUI: labels, ranges, colour
 * pickers, the lot. Rebuilding any of that for pasted templates would mean two
 * form renderers that have to agree forever, and the second one would always be
 * the worse of the two.
 *
 * So a declared field is translated into the Zod it would have been written as
 * by hand, and everything downstream — SchemaForm, the defaults, the export —
 * cannot tell the difference between a template someone pasted and one that
 * shipped with the app. That is the whole point: after the paste, it is just a
 * template.
 */

import { z } from "zod";
import { zColor } from "@remotion/zod-types";
import type { TemplateField } from "./format";

/**
 * `.describe()` is how the form gets its label — the same channel the built-in
 * templates use. Help text is appended because the form renders a description
 * as one string.
 */
const described = (field: TemplateField, schema: z.ZodTypeAny) =>
  schema.describe(field.help ? `${field.label} — ${field.help}` : field.label);

const oneField = (field: TemplateField): z.ZodTypeAny => {
  switch (field.type) {
    case "text": {
      let s = z.string();
      if (field.maxLength) s = s.max(field.maxLength);
      return described(field, s.default(field.default));
    }

    case "number": {
      let s = field.int ? z.number().int() : z.number();
      if (field.min !== undefined) s = s.min(field.min);
      if (field.max !== undefined) s = s.max(field.max);
      return described(field, s.default(field.default));
    }

    case "toggle":
      return described(field, z.boolean().default(field.default));

    case "color":
      /*
        No `.describe()` on the colour itself — the app reads that marker to
        decide between a colour picker and a text box, and describing it
        downgrades the field to a text box expecting a hex string. The label is
        carried by the optional wrapper instead.
      */
      return field.default === undefined
        ? zColor().optional().describe(field.label)
        : zColor().default(field.default).describe(field.label);

    case "choice":
      return described(
        field,
        z
          .enum(field.options.map((o) => o.value) as [string, ...string[]])
          .default(field.default),
      );

    case "image":
      // A data URL, supplied by the editor. Long, and never worth showing in a
      // single-line box, so it is marked for the app's file picker.
      return described(field, z.string().default(field.default)).describe(
        `${field.label}__image`,
      );
  }
};

/** The schema for a template's own fields, before the common ones are added. */
export const fieldsToZod = (fields: TemplateField[]) => {
  const shape: z.ZodRawShape = {};
  for (const field of fields) shape[field.key] = oneField(field);
  return z.object(shape);
};

/** Everything a template starts with, read straight back out of the schema. */
export const fieldDefaults = (fields: TemplateField[]): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  for (const field of fields) {
    if (field.type === "color" && field.default === undefined) continue;
    out[field.key] = field.default;
  }
  return out;
};
