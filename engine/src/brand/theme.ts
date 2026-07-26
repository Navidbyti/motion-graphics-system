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

/**
 * Every field is optional, which is what turns this from "a custom theme" into
 * "a set of overrides".
 *
 * With `brand: "custom"` a full theme arrives and the defaults fill any gap.
 * With one of the house brands, only the keys the editor actually changed
 * arrive, and they are merged over that brand — so "Cash for Chat but the
 * accent is a deeper gold" stays Cash for Chat, keeps its motion and its fonts,
 * and needs no forking into a separate custom theme that then drifts from the
 * real one.
 */
export const themeSchema = z.object({
  name: z.string().max(30).optional(),

  ink: z.string().optional(),
  surface: z.string().optional(),
  primary: z.string().optional(),
  accent: z.string().optional(),
  paper: z.string().optional(),
  textPrimary: z.string().optional(),
  textSecondary: z.string().optional(),
  positive: z.string().optional(),
  negative: z.string().optional(),

  /**
   * A family name, not a file. Bundled families always resolve; anything else
   * depends on the machine having it installed.
   */
  fontDisplay: z.string().max(60).optional(),
  fontBody: z.string().max(60).optional(),

  /** Drives contrast choices in templates that need to know. */
  dark: z.boolean().optional(),

  /** Entrance feel, mirroring the built-in brands' motion personality. */
  motion: z.enum(["snappy", "settle", "pop", "heavy", "exact"]).optional(),
  pace: z.number().min(0.5).max(2).optional(),

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

/** A partial set of overrides. Every field may be absent. */
export type ThemeInput = z.infer<typeof themeSchema>;

/** A theme with nothing missing — what the Settings editor works with. */
export type FullTheme = Required<Omit<ThemeInput, "customFontName" | "customFontData">> &
  Pick<ThemeInput, "customFontName" | "customFontData">;

/** The palette keys, so the app can offer exactly these and no others. */
export const PALETTE_KEYS = [
  "primary",
  "accent",
  "ink",
  "surface",
  "paper",
  "textPrimary",
  "textSecondary",
  "positive",
  "negative",
] as const;

export type PaletteKey = (typeof PALETTE_KEYS)[number];

/** A sensible neutral starting point for someone building their own. */
export const defaultTheme: FullTheme = {
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

const fromTheme = (input: ThemeInput): BrandDefinition => {
  const theme = { ...defaultTheme, ...stripUndefined(input) };
  return {
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
  };
};

/**
 * An absent key and a key set to undefined must mean the same thing.
 *
 * Spreading an override object straight over a brand would let
 * `{ primary: undefined }` blank out the brand's primary — which is exactly the
 * shape produced by clearing a colour field in the UI.
 */
const stripUndefined = <T extends object>(obj: T): Partial<T> =>
  Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined && v !== ""),
  ) as Partial<T>;

/**
 * The single entry point templates should use.
 *
 * `brand` names one of the house brands or "custom". `theme` is a set of
 * overrides in both cases — the whole thing for "custom", and only the keys the
 * editor changed for a house brand.
 *
 * Merging over a house brand rather than forking it into a custom theme is what
 * lets someone tune one colour without inheriting a second, separate identity
 * that then drifts from the real brand as it evolves.
 */
export const resolveTheme = (
  brand: string,
  theme?: ThemeInput | null,
): BrandDefinition => {
  if (brand === "custom") return fromTheme(theme ?? defaultTheme);

  const base = getBrand(brand);
  const overrides = stripUndefined(theme ?? {});
  if (Object.keys(overrides).length === 0) return base;

  const palette = { ...base.palette };
  for (const key of PALETTE_KEYS) {
    const value = overrides[key];
    if (value) palette[key] = value;
  }

  return {
    ...base,
    palette,
    font: {
      display: overrides.fontDisplay ? stack(overrides.fontDisplay) : base.font.display,
      body: overrides.fontBody ? stack(overrides.fontBody) : base.font.body,
      numeric: overrides.fontBody ? stack(overrides.fontBody) : base.font.numeric,
    },
    motion: {
      entrance: overrides.motion ?? base.motion.entrance,
      emphasis: overrides.motion ?? base.motion.emphasis,
      pace: overrides.pace ?? base.motion.pace,
    },
    dark: overrides.dark ?? base.dark,
  };
};

export const THEME_CHOICES = [
  ...Object.values(brands).map((b) => ({ id: b.id, name: b.name })),
  { id: "custom", name: "Custom theme" },
];
