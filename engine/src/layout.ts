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
  direction?: Direction;
}): Layout => {
  const { width, height } = useVideoConfig();
  const scale = opts?.scale ?? 1;
  const dir = opts?.direction ?? "ltr";
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
