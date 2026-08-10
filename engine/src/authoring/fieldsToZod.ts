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
import { annotationSchema } from "../charting/annotations";
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

    /*
      The SHAPE is the interface here, not a flag.

      SchemaForm looks at an array-of-objects' column names: open/high/low/close
      gets the Yahoo fetch and the paste-from-spreadsheet box, label/value gets
      the same for a series, and the annotation union gets the list editor and
      Build mode's drag handles. Emitting the identical schema a built-in chart
      declares is what hands a pasted template that entire workflow without a
      line of app code knowing pasted templates exist.
    */
    case "bars":
      return described(
        field,
        z
          .array(
            z.object({
              open: z.number(),
              high: z.number(),
              low: z.number(),
              close: z.number(),
            }),
          )
          .min(2)
          .max(field.maxRows)
          .default(field.default),
      );

    case "series":
      return described(
        field,
        z
          .array(z.object({ label: z.string(), value: z.number() }))
          .min(2)
          .max(field.maxRows)
          .default(field.default),
      );

    case "annotations":
      return described(field, z.array(annotationSchema).default([]));

    case "image":
      /*
        One `describe`, not two. The second call overwrote the first, so the
        internal "__image" marker became the visible label and the form showed
        "Coin Image__image" to the person filling it in.
      */
      return described(field, z.string().default(field.default));
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
