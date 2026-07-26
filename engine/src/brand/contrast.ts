/**
 * CONTRAST — pick readable text for a brand-driven fill.
 *
 * The message-box styles put text directly on a brand colour. Hardcoding white
 * would be right for Cash for Chat's red and Free Hotel Card's teal, and wrong
 * for Billionaire Signal's gold, where white text on #D4AF37 sits around 1.9:1
 * and is genuinely hard to read. Since brand is a prop, the template cannot
 * know which case it is in — so it measures.
 *
 * WCAG relative luminance and contrast ratio, nothing exotic.
 */

const channel = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

const luminance = (hex: string): number => {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h.slice(0, 6);
  const n = Number.parseInt(full, 16);
  if (Number.isNaN(n)) return 0;
  return (
    0.2126 * channel(((n >> 16) & 255) / 255) +
    0.7152 * channel(((n >> 8) & 255) / 255) +
    0.0722 * channel((n & 255) / 255)
  );
};

/** 1 (identical) to 21 (black on white). WCAG wants ≥ 4.5 for body text. */
export const contrastRatio = (a: string, b: string): number => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

/** Whichever of the two candidates reads better on `background`. */
export const readableOn = (background: string, light: string, dark: string): string =>
  contrastRatio(background, light) >= contrastRatio(background, dark) ? light : dark;

/** True when `background` is dark enough to carry light text. */
export const isDarkFill = (background: string): boolean => luminance(background) < 0.4;
