/**
 * LAYOUT — the shared sizing and direction rules.
 *
 * Every template calls `useLayout()` instead of computing its own `px()`. Three
 * reasons, each learned the hard way:
 *
 *  1. The scaling rule is subtle and I already got it wrong once. Scaling type
 *     by composition *width* is correct within one aspect and badly wrong across
 *     aspects — landscape came out 1.8× too large. It scales by the shorter side.
 *     That rule now lives in exactly one place.
 *  2. The editor can resize a graphic. `scale` multiplies everything at once, so
 *     "make the chart smaller" is one slider rather than a per-template feature.
 *  3. Right-to-left text needs direction and alignment to flip together.
 *     Templates that use these helpers get Persian support for free.
 */

import { useVideoConfig } from "remotion";

export type Direction = "ltr" | "rtl";

/** What the editor picks. "auto" reads the script off the text itself. */
export type DirectionSetting = Direction | "auto";

/**
 * Characters that only appear in right-to-left scripts: Hebrew, Arabic (which
 * Persian is written in), Syriac, Thaana, and the Arabic presentation forms.
 * Digits and punctuation are deliberately absent — they occur in both, so they
 * say nothing about which way a line runs.
 */
const RTL_CHARS =
  /[֐-׿؀-ۿ܀-ݏހ-޿ࢠ-ࣿיִ-﷿ﹰ-﻿]/;

/**
 * Detect direction from content.
 *
 * This exists because the alternative is worse than it sounds. With a manual
 * toggle, typing Persian into a template left at its default renders every line
 * in left-to-right order — the words come out reversed, aligned to the wrong
 * edge, with the bubble tail on the wrong side. Nothing errors; it just reads
 * as gibberish to anyone who can read it, and the editor has no reason to
 * suspect a field called "direction" that he never touched.
 *
 * The toggle stays for the mixed cases the heuristic can't win: a Persian
 * sentence containing a long English quote, or the reverse.
 */
export const detectDirection = (text?: string): Direction =>
  text && RTL_CHARS.test(text) ? "rtl" : "ltr";

/** Resolve the editor's choice against the actual text. */
export const resolveDirection = (
  setting: DirectionSetting | undefined,
  text?: string,
): Direction => (!setting || setting === "auto" ? detectDirection(text) : setting);

export type Layout = {
  width: number;
  height: number;
  /** Aspect ratio. >1 is landscape, <1 is portrait, 1 is square. */
  aspect: number;
  isVertical: boolean;
  /**
   * Scale a 1080-referenced value to this frame, including the editor's size
   * adjustment. Use for every dimension: type, spacing, radius, stroke.
   */
  px: (n: number) => number;
  dir: Direction;
  isRTL: boolean;
  /** "left"/"right" flipped for RTL — use instead of hardcoding either. */
  start: "left" | "right";
  end: "left" | "right";
  /** flex-start equivalents for text alignment. */
  textStart: "left" | "right";
  /**
   * True for unusually tall or wide frames, where a layout tuned for the three
   * standard formats may need to simplify — e.g. drop a secondary column.
   */
  isExtreme: boolean;
};

export const useLayout = (opts?: {
  scale?: number;
  direction?: DirectionSetting;
  /**
   * The template's own copy. Only read when `direction` is "auto" (or unset),
   * so a template that passes nothing behaves exactly as before.
   */
  text?: string;
}): Layout => {
  const { width, height } = useVideoConfig();
  const scale = opts?.scale ?? 1;
  const dir = resolveDirection(opts?.direction, opts?.text);
  const isRTL = dir === "rtl";
  const aspect = width / height;

  return {
    width,
    height,
    aspect,
    isVertical: height > width,
    // Shorter side, not width — see the note at the top of this file.
    px: (n: number) => (n * Math.min(width, height) * scale) / 1080,
    dir,
    isRTL,
    start: isRTL ? "right" : "left",
    end: isRTL ? "left" : "right",
    textStart: isRTL ? "right" : "left",
    // Beyond roughly 2.4:1 either way, the standard safe areas stop making sense.
    isExtreme: aspect > 2.4 || aspect < 1 / 2.4,
  };
};
