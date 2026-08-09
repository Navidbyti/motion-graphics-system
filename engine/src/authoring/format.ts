/**
 * THE PASTED TEMPLATE FORMAT — what an AI writes and the app validates.
 *
 * The point of this file is that a new template is DATA, not code.
 *
 * Code cannot work here. The Remotion bundle is built once when the app is
 * packaged — that is what took startup from 99 seconds to 13 — and rendering
 * runs a headless browser against that prebuilt bundle. A pasted `.tsx` would
 * have to be compiled and the whole bundle rebuilt on the editor's machine
 * before anything could be exported. Data needs none of that: one interpreter
 * is compiled into the bundle in advance and reads whatever it is handed.
 *
 * But the real argument is failure modes. Code fails silently — it type-checks,
 * it previews, and it breaks at export. This project has shipped all three of
 * these: `Math.random()` in a template (Remotion renders each frame in
 * isolation, so the value differs per frame and the graphic boils),
 * `interpolate()` with a non-monotonic input range (a hard crash on empty
 * text), and `backdrop-filter` for glass (a silent no-op in alpha export, which
 * is why the glass was a white blob for a week). A model that has read a
 * thousand React tutorials and none of this will write all three.
 *
 * None of them can be expressed here. The interpreter owns those decisions, so
 * they are made once, correctly. What a template can say is WHAT to show and
 * WHEN — never how to compute it.
 *
 * The other half of reliability is the repair loop. Everything below is a Zod
 * schema, so a bad paste produces an exact path — `layers[3].style.font` — in
 * language the editor can hand straight back to the model. Reliability does not
 * come from the model being right first time; it comes from every wrong answer
 * being precisely diagnosable by someone who cannot read code.
 */

import { z } from "zod";
import { zColor } from "@remotion/zod-types";

/**
 * Bumped only when an OLD file would render WRONG under new code.
 *
 * Adding an optional property is not a version change — old files still mean
 * what they said. Changing what an existing property does is, and without this
 * the failure is silent: a template someone built months ago quietly renders
 * differently and there is nothing to point at.
 */
export const TEMPLATE_FORMAT_VERSION = 1;

/* ------------------------------------------------------------------ *
 * Values a template may name
 * ------------------------------------------------------------------ */

/**
 * Colours are named, not typed in.
 *
 * A template that hardcodes #2F6BFF looks wrong the moment it is used under a
 * different brand, and the whole premise of the brand system is that a rebrand
 * is one file. So a layer names a ROLE and the theme resolves it — the same
 * indirection every built-in template already goes through.
 *
 * A literal hex is still allowed, because sometimes a graphic genuinely needs
 * one specific colour and forbidding it would just push people to fake it.
 */
/*
  Exactly the keys a brand defines, plus transparent. Not a superset: a token
  that only some brands carry would resolve on one brand and fall back on
  another, and "looks right under Hoteldebit, wrong under Nestie" is the class
  of bug the brand system exists to prevent.
*/
export const COLOR_TOKENS = [
  "ink",
  "surface",
  "paper",
  "primary",
  "accent",
  "positive",
  "negative",
  "textPrimary",
  "textSecondary",
  "transparent",
] as const;

export const colorValue = z.union([
  z.enum(COLOR_TOKENS),
  zColor(),
  /** `{{fieldKey}}` — the colour comes from a field the editor can change. */
  z.string().regex(/^\{\{\s*[a-zA-Z_][a-zA-Z0-9_]*\s*\}\}$/),
]);

/**
 * Sizes are named too, for the same reason and one more: a number in pixels is
 * meaningless across three formats. The scale is defined against a 1080-wide
 * frame and scaled per format, so "headline" is the right size everywhere and
 * `84` is the right size in exactly one place.
 */
export const TYPE_SIZES = [
  "hero",
  "headline",
  "subhead",
  "support",
  "label",
  "caption",
] as const;

export const SPACE_STEPS = ["xs", "sm", "md", "lg", "xl", "xxl"] as const;
export const RADIUS_STEPS = ["sm", "md", "lg", "pill", "none"] as const;
export const FONT_ROLES = ["display", "body", "numeric"] as const;
export const WEIGHTS = ["regular", "medium", "semibold", "bold", "black"] as const;

/* ------------------------------------------------------------------ *
 * Fields — the form the editor gets
 * ------------------------------------------------------------------ */

/**
 * What the person using the template can change.
 *
 * Declared rather than inferred, because the form is the actual product for
 * most people: they will never see the layers, they will see these boxes. A
 * field says what it is called, what it accepts, and what it starts as; the
 * app turns that into the same generated form every built-in template gets.
 */
const fieldBase = {
  /** Referenced from layers as `{{key}}`. Must be a plain identifier. */
  key: z
    .string()
    .regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/, "must be letters, digits and underscores"),
  /** Shown above the input. Written for an editor, not a developer. */
  label: z.string().min(1).max(60),
  /** Optional one-liner under the label. */
  help: z.string().max(160).optional(),
};

export const fieldSchema = z.discriminatedUnion("type", [
  z.object({
    ...fieldBase,
    type: z.literal("text"),
    default: z.string().default(""),
    maxLength: z.number().int().min(1).max(2000).optional(),
    /** A textarea rather than a single line. */
    multiline: z.boolean().default(false),
  }),
  z.object({
    ...fieldBase,
    type: z.literal("number"),
    default: z.number().default(0),
    min: z.number().optional(),
    max: z.number().optional(),
    step: z.number().positive().optional(),
    /** Whole numbers only — counts, indexes, decimal places. */
    int: z.boolean().default(false),
  }),
  z.object({
    ...fieldBase,
    type: z.literal("toggle"),
    default: z.boolean().default(true),
  }),
  z.object({
    ...fieldBase,
    type: z.literal("color"),
    /** Omitted means "follow the brand", which is usually what you want. */
    default: zColor().optional(),
  }),
  z.object({
    ...fieldBase,
    type: z.literal("choice"),
    options: z
      .array(z.object({ value: z.string(), label: z.string() }))
      .min(2)
      .max(12),
    default: z.string(),
  }),
  z.object({
    ...fieldBase,
    type: z.literal("image"),
    /** Supplied by the editor at use time; a template cannot ship an image. */
    default: z.string().default(""),
  }),
]);

export type TemplateField = z.infer<typeof fieldSchema>;

/* ------------------------------------------------------------------ *
 * Placement
 * ------------------------------------------------------------------ */

export const ANCHORS = [
  "topLeft",
  "top",
  "topRight",
  "left",
  "center",
  "right",
  "bottomLeft",
  "bottom",
  "bottomRight",
] as const;

/**
 * Where a layer sits, as percentages of the frame.
 *
 * Percentages rather than pixels because the same template has to be right at
 * 1080×1920, 1080×1080 and 1920×1080. The anchor is what makes that work: a
 * caption anchored `bottom` stays pinned to the bottom in all three, where the
 * same layer positioned by its top-left corner drifts.
 */
export const boxSchema = z.object({
  /** 0 = left edge, 100 = right edge. */
  x: z.number().min(-20).max(120).default(50),
  /** 0 = top edge, 100 = bottom edge. */
  y: z.number().min(-20).max(120).default(50),
  /** Width as a percentage of the frame. Omit to size to content. */
  w: z.number().min(1).max(140).optional(),
  /** Height as a percentage. Omit to size to content. */
  h: z.number().min(1).max(140).optional(),
  /** Which part of the layer sits at (x, y). */
  anchor: z.enum(ANCHORS).default("center"),
  /**
   * Keep inside the safe area — clear of the platform's own UI. On by default
   * because a caption under TikTok's chrome is invisible, and that is not
   * something anyone notices until the video is posted.
   */
  safe: z.boolean().default(true),
  /** Degrees. Small angles only; anything more reads as a mistake. */
  rotate: z.number().min(-45).max(45).default(0),
});

/* ------------------------------------------------------------------ *
 * Motion
 * ------------------------------------------------------------------ */

export const ENTRANCES = [
  "none",
  "fade",
  "fadeUp",
  "scaleIn",
  "wipeUp",
  "typewriter",
] as const;

/**
 * When a layer arrives and how.
 *
 * Timing is in SECONDS, not frames. Frames are an implementation detail of the
 * render, and asking a person — or a model — to think at 30fps is how you get
 * a template that is subtly wrong at any other frame rate.
 */
export const motionSchema = z.object({
  in: z.enum(ENTRANCES).default("fadeUp"),
  /** Seconds from the start of the graphic. */
  at: z.number().min(0).max(120).default(0),
  /**
   * Extra delay per item for text revealed word by word, in seconds. Also
   * used to offset a layer inside a group.
   */
  stagger: z.number().min(0).max(2).default(0.06),
  /**
   * Fade out before the graphic ends. Exits are shorter than entrances by
   * design — the viewer has already read it.
   */
  out: z.boolean().default(true),
  /** Leave the frame entirely after this many seconds. Omit to stay. */
  until: z.number().min(0).max(120).optional(),
});

/* ------------------------------------------------------------------ *
 * Layers
 * ------------------------------------------------------------------ */

const layerBase = {
  /** Unique within the template. Used for ordering and error messages. */
  id: z.string().min(1).max(40),
  box: boxSchema.default({}),
  motion: motionSchema.default({}),
  /** 0–1. Applies to the whole layer, on top of any colour alpha. */
  opacity: z.number().min(0).max(1).default(1),
};

export const textStyleSchema = z.object({
  size: z.union([z.enum(TYPE_SIZES), z.number().min(8).max(400)]).default("subhead"),
  font: z.enum(FONT_ROLES).default("display"),
  weight: z.enum(WEIGHTS).default("bold"),
  color: colorValue.default("textPrimary"),
  align: z.enum(["left", "center", "right"]).default("center"),
  /** Multiplier, not pixels — it has to hold at every size. */
  lineHeight: z.number().min(0.7).max(2.5).default(1.1),
  letterSpacing: z.number().min(-0.05).max(0.4).default(0),
  transform: z.enum(["none", "uppercase", "lowercase"]).default("none"),
  /**
   * Left unset, direction is detected from the text itself. Persian and Arabic
   * render mirrored under a hardcoded `ltr`, and the template author cannot
   * know in advance what the editor will type into the field.
   */
  direction: z.enum(["auto", "ltr", "rtl"]).default("auto"),
});

export const layerSchema = z.discriminatedUnion("type", [
  z.object({
    ...layerBase,
    type: z.literal("text"),
    /**
     * Literal text with `{{fieldKey}}` substituted in. Mustache rather than a
     * nested reference object because it composes — "{{currency}}{{price}}"
     * is one string and one obvious rule, and a model gets it right without
     * being taught anything.
     */
    value: z.string().max(2000),
    style: textStyleSchema.default({}),
  }),

  z.object({
    ...layerBase,
    type: z.literal("shape"),
    shape: z.enum(["rect", "ellipse", "line"]).default("rect"),
    fill: colorValue.default("surface"),
    /** Fill alpha, separate from layer opacity so a tint can sit under text. */
    fillOpacity: z.number().min(0).max(1).default(1),
    stroke: colorValue.optional(),
    strokeWidth: z.number().min(0).max(40).default(0),
    radius: z.enum(RADIUS_STEPS).default("md"),
    /** A soft drop shadow. Heavy shadows read as noise in video. */
    shadow: z.boolean().default(false),
  }),

  z.object({
    ...layerBase,
    type: z.literal("image"),
    /** `{{fieldKey}}` of an image field, or a URL the render can reach. */
    src: z.string().max(2000),
    fit: z.enum(["cover", "contain"]).default("cover"),
    radius: z.enum(RADIUS_STEPS).default("none"),
  }),

  z.object({
    ...layerBase,
    type: z.literal("logo"),
    /** Follows the brand the editor picked; nothing to configure. */
    tint: colorValue.optional(),
  }),
]);

export type TemplateLayer = z.infer<typeof layerSchema>;

/* ------------------------------------------------------------------ *
 * The file
 * ------------------------------------------------------------------ */

export const templateFileSchema = z
  .object({
    /**
     * Rejected loudly if it is not a version this build understands. A file
     * from the future silently ignoring half its own layers is worse than a
     * file that refuses to load and says why.
     */
    version: z.number().int().min(1).max(TEMPLATE_FORMAT_VERSION),

    /** Lowercase, hyphenated. Identifies the template on disk and in the Library. */
    id: z
      .string()
      .regex(/^[a-z][a-z0-9-]{2,39}$/, "lowercase letters, digits and hyphens"),
    title: z.string().min(1).max(60),
    /** One line on the Library card, written for the person choosing it. */
    description: z.string().min(1).max(160),
    tags: z.array(z.string().max(20)).max(6).default([]),

    /** How long the graphic runs. Layer timings are checked against it. */
    seconds: z.number().min(0.5).max(120).default(5),

    fields: z.array(fieldSchema).max(24).default([]),
    layers: z.array(layerSchema).min(1).max(40),
  })
  .superRefine((file, ctx) => {
    /*
      Everything past this point is a rule Zod cannot express structurally but
      that would otherwise produce a graphic that is valid and wrong. Each one
      is here because it is a mistake worth catching at paste time, when there
      is still a model in the loop to fix it.
    */

    const seen = new Set<string>();
    for (const [i, field] of file.fields.entries()) {
      if (seen.has(field.key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["fields", i, "key"],
          message: `duplicate field key "${field.key}" — each field needs its own name`,
        });
      }
      seen.add(field.key);

      if (field.type === "choice" && !field.options.some((o) => o.value === field.default)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["fields", i, "default"],
          message: `default "${field.default}" is not one of the options`,
        });
      }
    }

    const ids = new Set<string>();
    for (const [i, layer] of file.layers.entries()) {
      if (ids.has(layer.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["layers", i, "id"],
          message: `duplicate layer id "${layer.id}"`,
        });
      }
      ids.add(layer.id);

      // A layer that arrives after the graphic has ended is never seen. It is
      // always a mistake, and an invisible one — the preview just looks empty.
      if (layer.motion.at >= file.seconds) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["layers", i, "motion", "at"],
          message: `starts at ${layer.motion.at}s but the graphic is only ${file.seconds}s long`,
        });
      }
      if (layer.motion.until !== undefined && layer.motion.until <= layer.motion.at) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["layers", i, "motion", "until"],
          message: "must be later than the layer's start time",
        });
      }

      // Every {{reference}} must point at a field that exists. A typo here
      // renders the braces literally, which looks like the app is broken.
      const refs =
        layer.type === "text"
          ? [layer.value]
          : layer.type === "image"
            ? [layer.src]
            : [];
      for (const source of refs) {
        for (const match of source.matchAll(/\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g)) {
          if (!seen.has(match[1])) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ["layers", i, layer.type === "text" ? "value" : "src"],
              message: `{{${match[1]}}} does not match any field — declare it in "fields" or fix the spelling`,
            });
          }
        }
      }
    }
  });

export type TemplateFile = z.infer<typeof templateFileSchema>;
