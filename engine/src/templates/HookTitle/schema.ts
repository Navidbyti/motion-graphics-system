import { z } from "zod";
import { headline, label, subline, toggle, withCommonLegacy } from "../fields";

export const hookTitleSchema = withCommonLegacy({
  eyebrow: label("Small line above the headline, e.g. a category or teaser"),

  text: headline("The hook — the first thing the viewer reads"),

  subline: subline("Optional line under the headline. Leave empty to hide it"),

  emphasis: label(
    "One word from the headline to pick out in the brand's accent colour. " +
      "Leave empty for none",
  ),

  scrim: toggle(
    "Darken behind the text so it stays readable over bright footage",
  ),
});

export type HookTitleProps = z.infer<typeof hookTitleSchema>;

export const hookTitleDefaults: HookTitleProps = {
  brand: "freeHotelCard",
  eyebrow: "THE FUTURE OF TRAVEL",
  text: "Today's hotel rates for the next 20 years",
  subline: "Lock them in once. Never pay inflation again.",
  emphasis: "20",
  scrim: true,
  speed: 1,
};

/* ------------------------------------------------------------------ *
 * Timing
 * ------------------------------------------------------------------ */

export const TIMING = {
  intro: 0.2,
  /** Per word of the headline. Words stagger in rather than appearing together. */
  perWord: 0.07,
  hold: 1.4,
  outro: 0.5,
} as const;

export const wordCount = (text: string) =>
  text.trim().split(/\s+/).filter(Boolean).length;

export const hookTitleSeconds = (text: string, speed: number) =>
  (TIMING.intro + wordCount(text) * TIMING.perWord + TIMING.hold + TIMING.outro) /
  speed;
