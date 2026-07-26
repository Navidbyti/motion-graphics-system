/**
 * BRAND TOKENS — the single source of truth.
 *
 * Every template imports from here. No template may hardcode a colour, font,
 * or margin. This is what makes eight different templates look like one company
 * made them, and what lets a rebrand be a one-file change.
 *
 * PLACEHOLDER VALUES: replace once real brand assets land in brand/ on Drive.
 * Marked with TODO(brand) so they're easy to find.
 */

/** TODO(brand): replace with the real Hoteldebit palette. */
export const color = {
  // Core
  ink: "#0B0F17",
  surface: "#141A24",
  surfaceRaised: "#1D2531",
  paper: "#F7F9FC",

  // Brand
  primary: "#2F6BFF",
  primarySoft: "#5C8CFF",
  accent: "#FFC24B",

  // Semantic — used by data templates (candles, stats, deltas)
  positive: "#22C55E",
  negative: "#EF4444",
  neutral: "#8A94A6",

  // Text
  textPrimary: "#FFFFFF",
  textSecondary: "#AAB4C4",
  textOnLight: "#0B0F17",
} as const;

/** TODO(brand): swap for the licensed brand faces once confirmed embeddable. */
export const font = {
  display: '"Inter", "Segoe UI", system-ui, sans-serif',
  body: '"Inter", "Segoe UI", system-ui, sans-serif',
  /** Tabular figures matter for prices and counters — digits must not jitter. */
  numeric: '"Inter", "Segoe UI", system-ui, sans-serif',
} as const;

export const weight = {
  regular: 400,
  medium: 500,
  semibold: 600,
  bold: 700,
  black: 900,
} as const;

/**
 * Type scale, expressed for a 1080px-wide frame.
 * Scale with `scaleToWidth()` for other widths — never eyeball a new size.
 * Minimums come from the official Remotion video-layout guidance: text must be
 * readable at viewing distance, so when unsure go larger, not smaller.
 */
export const type = {
  hero: 116,
  headline: 84,
  subhead: 56,
  support: 44,
  label: 32,
  caption: 26,
} as const;

/** Scale a 1080-referenced size to the actual composition width. */
export const scaleToWidth = (size: number, width: number) => (size * width) / 1080;

/**
 * Safe area, for a 1080px-wide frame. Keeps content clear of platform UI
 * (TikTok/Reels captions, profile chrome) and of the frame edge.
 */
export const safe = {
  x: 80,
  top: 100,
  bottom: 100,
  /** Extra bottom inset for vertical social, where UI overlays the lower third. */
  socialBottom: 320,
} as const;

/** Spacing rhythm. Use these, not arbitrary numbers, so templates align. */
export const space = {
  xs: 8,
  sm: 16,
  md: 24,
  lg: 40,
  xl: 64,
  xxl: 96,
} as const;

export const radius = {
  sm: 12,
  md: 20,
  lg: 32,
  pill: 999,
} as const;

/** Elevation — kept subtle. Heavy shadows read as noise in video. */
export const shadow = {
  soft: "0 20px 60px rgba(0,0,0,0.35)",
  hard: "0 8px 24px rgba(0,0,0,0.5)",
} as const;

/** TODO(brand): point at the real logo once it lands in public/brand/. */
export const logo = {
  src: "brand/logo.svg",
  /** Aspect ratio (w/h) so templates can reserve a slot without loading it. */
  aspect: 4,
} as const;

/** Canonical output formats. Templates must render correctly in all three. */
export const formats = {
  vertical: { width: 1080, height: 1920 },
  square: { width: 1080, height: 1080 },
  landscape: { width: 1920, height: 1080 },
} as const;

export type FormatName = keyof typeof formats;
