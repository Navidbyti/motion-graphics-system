/**
 * BRANDS — three separate identities, one template library.
 *
 * Cash for Chat, Billionaire Signal and Free Hotel Card are visually opposite:
 * warm red/yellow and playful; gold on near-black and premium; teal and light.
 * A template must be able to render as any of them.
 *
 * Brand is therefore a **prop**, not a separate composition. Making it a
 * composition dimension would mean 3 formats × 3 brands = 9 compositions per
 * template, all of which drift apart. As a prop it stays 3, the editor gets a
 * dropdown, and prompt→props can set it like anything else.
 *
 * Structural tokens (type scale, spacing, radius, safe areas) live in
 * tokens.ts and are deliberately shared — the brands differ in *look*, not in
 * how a vertical video is laid out.
 *
 * NOTE: hex values were read off the supplied brand sheets and logos. Correct
 * any that are off — it is a one-line change here and every template follows.
 */

import { SPRING, type SpringName } from "../motion";

export type BrandPalette = {
  /** Darkest surface. Backing cards, text on light. */
  ink: string;
  surface: string;
  /** Primary identity colour. */
  primary: string;
  /** Secondary/accent identity colour. */
  accent: string;
  paper: string;
  textPrimary: string;
  textSecondary: string;
  /** Data semantics. Kept per-brand so a chart reads correctly in each. */
  positive: string;
  negative: string;
};

export type BrandDefinition = {
  id: string;
  name: string;
  site: string;
  palette: BrandPalette;
  font: { display: string; body: string; numeric: string };
  logo: { src: string | null; aspect: number };
  /**
   * Motion personality.
   *
   * Emil Kowalski's cohesion principle: motion should match the product's
   * character. A playful consumer brand can bounce; a premium financial one
   * must not — bounce reads as cheap where authority is the point. Templates
   * pull their entrance spring from here rather than hardcoding one, so the
   * same template feels correct in all three brands.
   */
  motion: {
    entrance: SpringName;
    emphasis: SpringName;
    /** Multiplier on stagger and hold timings. <1 is brisker. */
    pace: number;
  };
  /** True when the brand's surfaces are dark, so templates can pick contrast. */
  dark: boolean;
};

/* ------------------------------------------------------------------ */

export const cashForChat: BrandDefinition = {
  id: "cashForChat",
  name: "Cash for Chat",
  site: "cashforchat.com",
  palette: {
    ink: "#111111",
    surface: "#1C1A18",
    primary: "#E02B0A",
    accent: "#F5B800",
    paper: "#FFFFFF",
    textPrimary: "#FFFFFF",
    textSecondary: "#C9C4BE",
    positive: "#1FA463",
    negative: "#E02B0A",
  },
  font: {
    display: '"Poppins", "Segoe UI", system-ui, sans-serif',
    body: '"Inter", "Segoe UI", system-ui, sans-serif',
    numeric: '"Inter", "Segoe UI", system-ui, sans-serif',
  },
  logo: { src: null, aspect: 1 },
  // Friendly and human — this is the one brand that earns a bounce.
  motion: { entrance: "settle", emphasis: "pop", pace: 1 },
  dark: true,
};

export const billionaireSignal: BrandDefinition = {
  id: "billionaireSignal",
  name: "Billionaire Signal",
  site: "billionairesignal.com",
  palette: {
    ink: "#0B0E13",
    surface: "#161A22",
    primary: "#D4AF37",
    accent: "#F2D479",
    paper: "#F5F3EE",
    textPrimary: "#F7F4EC",
    textSecondary: "#9AA1AE",
    positive: "#22C55E",
    negative: "#EF4444",
  },
  font: {
    display: '"Inter", "Segoe UI", system-ui, sans-serif',
    body: '"Inter", "Segoe UI", system-ui, sans-serif',
    numeric: '"Inter", "Segoe UI", system-ui, sans-serif',
  },
  logo: { src: null, aspect: 1 },
  // Premium and authoritative. Weighted, no bounce — springiness would
  // undercut the whole proposition.
  motion: { entrance: "heavy", emphasis: "snappy", pace: 1.15 },
  dark: true,
};

export const freeHotelCard: BrandDefinition = {
  id: "freeHotelCard",
  name: "Free Hotel Card",
  site: "freehotelcard.com",
  palette: {
    ink: "#14343F",
    surface: "#1B4552",
    primary: "#23B5B0",
    accent: "#F5C542",
    paper: "#FFFFFF",
    textPrimary: "#FFFFFF",
    textSecondary: "#BFD8DE",
    positive: "#23B5B0",
    negative: "#E4572E",
  },
  font: {
    display: '"Poppins", "Segoe UI", system-ui, sans-serif',
    body: '"Inter", "Segoe UI", system-ui, sans-serif',
    numeric: '"Inter", "Segoe UI", system-ui, sans-serif',
  },
  logo: { src: null, aspect: 2.2 },
  // Light and optimistic — smooth glides rather than bounce or weight.
  motion: { entrance: "settle", emphasis: "settle", pace: 0.95 },
  dark: true,
};

/* ------------------------------------------------------------------ */

export const brands = { cashForChat, billionaireSignal, freeHotelCard } as const;

export type BrandId = keyof typeof brands;

export const BRAND_IDS = Object.keys(brands) as BrandId[];

export const getBrand = (id: BrandId | string): BrandDefinition =>
  brands[id as BrandId] ?? billionaireSignal;

/** Convenience for templates: `const { palette, font } = useBrandTokens(props.brand)`. */
export const brandSpring = (brand: BrandDefinition, which: "entrance" | "emphasis") =>
  SPRING[brand.motion[which]];
