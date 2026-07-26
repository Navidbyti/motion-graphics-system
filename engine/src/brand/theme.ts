/**
 * CUSTOM THEMES — the escape hatch for anyone outside the three house brands.
 *
 * The three built-in brands are a closed set, which is right for Hoteldebit and
 * wrong for anyone else running this app. A custom theme produces the *same*
 * shape a built-in brand does, so templates never branch on which they got:
 * they call `resolveTheme()` and use the result.
 *
 * The theme travels in inputProps rather than living in a config file the
 * renderer reads, because the renderer is a separate process from the UI. A
 * theme that arrives with the props can never disagree with the preview.
 */

import { z } from "zod";
import { type BrandDefinition, brands, getBrand } from "./brands";

/**
 * Font families that are guaranteed present, because they're bundled and
 * self-hosted. Anything else falls back to the system stack — which may look
 * different on a different machine, so the picker offers these first.
 */
export const BUNDLED_FONTS = ["Inter", "Poppins", "Vazirmatn"] as const;

export const themeSchema = z.object({
  name: z.string().max(30),

  ink: z.string(),
  surface: z.string(),
  primary: z.string(),
  accent: z.string(),
  paper: z.string(),
  textPrimary: z.string(),
  textSecondary: z.string(),
  positive: z.string(),
  negative: z.string(),

  /**
   * A family name, not a file. Bundled families always resolve; anything else
   * depends on the machine having it installed.
   */
  fontDisplay: z.string().max(60),
  fontBody: z.string().max(60),

  /** Drives contrast choices in templates that need to know. */
  dark: z.boolean(),

  /** Entrance feel, mirroring the built-in brands' motion personality. */
  motion: z.enum(["snappy", "settle", "pop", "heavy", "exact"]),
  pace: z.number().min(0.5).max(2),

  /**
   * A user-supplied font, carried as a data URL rather than a path.
   *
   * The renderer is a separate process from the UI, so a file path picked in
   * Settings might not resolve there — and the template contract forbids
   * fetching anything at render time. Embedding the bytes means the preview and
   * the export load exactly the same font.
   */
  customFontName: z.string().max(60).optional(),
  customFontData: z.string().optional(),
});

export type ThemeInput = z.infer<typeof themeSchema>;

/** A sensible neutral starting point for someone building their own. */
export const defaultTheme: ThemeInput = {
  name: "Custom",
  ink: "#101418",
  surface: "#1A1F26",
  primary: "#4C8DFF",
  accent: "#FFC24B",
  paper: "#FFFFFF",
  textPrimary: "#FFFFFF",
  textSecondary: "#AAB4C4",
  positive: "#22C55E",
  negative: "#EF4444",
  fontDisplay: "Inter",
  fontBody: "Inter",
  dark: true,
  motion: "settle",
  pace: 1,
};

/** Always end in a real stack, so a missing family degrades rather than breaks. */
const stack = (family: string) =>
  `"${family}", "Vazirmatn", "Segoe UI", system-ui, sans-serif`;

const fromTheme = (theme: ThemeInput): BrandDefinition => ({
  id: "custom",
  name: theme.name || "Custom",
  site: "",
  palette: {
    ink: theme.ink,
    surface: theme.surface,
    primary: theme.primary,
    accent: theme.accent,
    paper: theme.paper,
    textPrimary: theme.textPrimary,
    textSecondary: theme.textSecondary,
    positive: theme.positive,
    negative: theme.negative,
  },
  font: {
    display: stack(theme.fontDisplay),
    body: stack(theme.fontBody),
    numeric: stack(theme.fontBody),
  },
  logo: { src: null, aspect: 1 },
  motion: { entrance: theme.motion, emphasis: theme.motion, pace: theme.pace },
  dark: theme.dark,
});

/**
 * The single entry point templates should use.
 *
 * `brand` may name one of the three house brands or "custom"; when custom, the
 * theme object supplies the values. Falls back to a built-in brand if a custom
 * theme is selected but never provided, so a half-configured app still renders.
 */
export const resolveTheme = (
  brand: string,
  theme?: ThemeInput | null,
): BrandDefinition => {
  if (brand === "custom") return fromTheme(theme ?? defaultTheme);
  return getBrand(brand);
};

export const THEME_CHOICES = [
  ...Object.values(brands).map((b) => ({ id: b.id, name: b.name })),
  { id: "custom", name: "Custom theme" },
];
