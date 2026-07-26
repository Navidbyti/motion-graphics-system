/**
 * SHARED FIELD VOCABULARY
 *
 * Templates compose their schemas from these instead of inventing fields.
 *
 * The point is not to save typing — it's to stop vocabulary drift. Without a
 * shared vocabulary, template 1 calls it `title`, template 4 calls it
 * `headline` and template 7 calls it `heading`, each with a different length
 * limit and a differently-worded label. The editor then has to relearn the
 * panel for every template, and the app stops feeling like one product.
 *
 * Rule of thumb: if two templates could plausibly want the same field, it
 * belongs here. Genuinely unique data — the candle array, a room's amenity list
 * — stays local to its template.
 */

import { zColor } from "@remotion/zod-types";
import { z } from "zod";
import { BRAND_IDS, brands } from "../brand/brands";

/* ------------------------------------------------------------------ *
 * Text
 * ------------------------------------------------------------------ */

/** The one big line. Length capped so it can't wrap into the layout below it. */
export const headline = (describe = "Main headline, shown largest") =>
  z.string().max(60).describe(describe);

/** Secondary line under the headline. */
export const subline = (describe = "Supporting line under the headline") =>
  z.string().max(90).describe(describe);

/** Short label: badges, tickers, tags, eyebrow text. */
export const label = (describe = "Short label") =>
  z.string().max(24).describe(describe);

/** Call to action, e.g. an end-card button. */
export const cta = (describe = "Call to action text") =>
  z.string().max(30).describe(describe);

/* ------------------------------------------------------------------ *
 * Colour
 *
 * NEVER call .describe() on these. zColor() keeps its own marker
 * (`__remotion-color`) in the description slot; describing it overwrites the
 * marker and downgrades the colour picker to a plain text box. Human labels for
 * colour fields go in the registry entry's `labels` map.
 * ------------------------------------------------------------------ */

export const color = () => zColor();

/* ------------------------------------------------------------------ *
 * Numbers
 * ------------------------------------------------------------------ */

/**
 * Animation speed. Every template should expose this — it's the editor's first
 * instinct when something feels off, and it saves a template request.
 */
export const speed = () =>
  z
    .number()
    .min(0.5)
    .max(2)
    .describe("Animation speed. 1 is normal, 2 is twice as fast");

export const currency = (describe = "Symbol shown before the price, e.g. $ or €") =>
  z.string().max(3).describe(describe);

export const decimals = (describe = "Decimal places on the number") =>
  z.number().int().min(0).max(4).describe(describe);

/** 0–100 percentage, for opacity-like controls. */
export const percent = (describe: string) =>
  z.number().min(0).max(100).describe(describe);

/* ------------------------------------------------------------------ *
 * Toggles
 * ------------------------------------------------------------------ */

export const toggle = (describe: string) => z.boolean().describe(describe);

export const showLogo = (describe = "Show the logo") => toggle(describe);

/* ------------------------------------------------------------------ *
 * Composition helper
 * ------------------------------------------------------------------ */

/**
 * Which of the three brands this video is for.
 *
 * A prop rather than a separate composition: as a composition dimension it
 * would mean 3 formats × 3 brands = 9 compositions per template, all free to
 * drift apart. As a prop the editor gets a dropdown, prompt→props can set it,
 * and every template stays at 3 compositions.
 */
export const brand = () =>
  z
    .enum(BRAND_IDS as [string, ...string[]])
    .describe(
      "Which brand this video is for: " +
        Object.values(brands)
          .map((b) => b.name)
          .join(", "),
    );

/**
 * Fields every template carries, so the bottom of the props panel is always
 * the same and the editor builds muscle memory.
 *
 *   export const mySchema = withCommon({ headline: headline(), ... })
 */
export const withCommon = <T extends z.ZodRawShape>(shape: T) =>
  z.object({ ...shape, brand: brand(), speed: speed() });
