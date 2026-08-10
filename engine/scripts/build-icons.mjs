/**
 * Bake a curated icon set into the engine.
 *
 * Generated rather than hand-written, because SVG path data cannot be recalled
 * or invented — a path typed from memory produces a shape that is confidently
 * wrong, and nobody notices until it is in a video. These are lifted verbatim
 * from the upstream packages.
 *
 * Curated rather than complete. simple-icons alone is ~3,300 marks and lucide
 * ~2,000; bundling either whole would add megabytes to an installer for icons
 * nobody will name. The list below is what this library's videos actually use —
 * money, markets, hotels, and the handful of UI glyphs that carry meaning.
 *
 * Licences: simple-icons is CC0-1.0, lucide is ISC. Both permit redistribution;
 * the brand marks remain the property of their owners and are usable to refer
 * to the thing they denote, which is the only use a template has for them.
 *
 * Run with `npm run icons` in engine/ after changing the list.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import * as simpleIcons from "simple-icons";

const here = path.dirname(fileURLToPath(import.meta.url));

/*
  Resolved, not assumed. npm hoists shared dependencies to the workspace root,
  so guessing `engine/node_modules/lucide-static` found nothing and the script
  cheerfully generated a file with zero glyphs in it.
*/
const require_ = createRequire(import.meta.url);
const lucideDir = path.join(
  path.dirname(require_.resolve("lucide-static/package.json")),
  "icons",
);

/** Brand marks — solid, single path, carry their own official colour. */
const BRANDS = [
  "bitcoin", "ethereum", "tether", "solana", "binance", "coinbase", "cardano",
  "dogecoin", "litecoin", "ripple", "visa", "mastercard", "paypal", "stripe",
  "revolut", "wise", "airbnb", "bookingdotcom", "tripadvisor",
  "instagram", "tiktok", "youtube", "x", "whatsapp", "telegram", "linkedin",
  // simple-icons dropped some marks on request of the owner; the script warns
  // rather than failing, so a removed one is visible instead of silently absent.
];

/** Outline glyphs — stroked, meaning-carrying, tinted by the template. */
const GLYPHS = [
  "check", "check-check", "x", "arrow-up", "arrow-down", "arrow-right",
  "arrow-left", "trending-up", "trending-down", "chart-column", "chart-line",
  "chart-pie", "circle-alert", "circle-check", "circle-x", "info", "star",
  "flame", "zap", "clock", "calendar", "lock", "unlock", "shield", "wallet",
  "coins", "banknote", "credit-card", "piggy-bank", "landmark", "percent",
  "target", "rocket", "gift", "bell", "eye", "thumbs-up", "thumbs-down",
  "bed", "plane", "map-pin", "globe", "users", "user", "phone", "mail",
  "search", "settings", "download", "upload", "play", "pause", "hand-coins",
];

const out = { brands: {}, glyphs: {} };
const missing = [];

for (const name of BRANDS) {
  // simple-icons exports as siPascalCase.
  const key =
    "si" +
    name
      .replace(/[^a-z0-9]/gi, " ")
      .split(" ")
      .filter(Boolean)
      .map((w) => w[0].toUpperCase() + w.slice(1))
      .join("");
  const icon = simpleIcons[key];
  if (!icon?.path) {
    missing.push(`brand:${name} (${key})`);
    continue;
  }
  out.brands[name] = { path: icon.path, hex: `#${icon.hex}`, title: icon.title };
}

for (const name of GLYPHS) {
  const file = path.join(lucideDir, `${name}.svg`);
  if (!fs.existsSync(file)) {
    missing.push(`glyph:${name}`);
    continue;
  }
  const svg = fs.readFileSync(file, "utf8");
  /*
    The inner markup, not just the first path. Many lucide icons are several
    elements — a circle plus two paths — and taking only the first draws a
    fragment that looks like a rendering fault rather than an icon.
  */
  const inner = svg
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/^[\s\S]*?<svg[^>]*>/, "")
    .replace(/<\/svg>[\s\S]*$/, "")
    .replace(/\s+/g, " ")
    .trim();
  out.glyphs[name] = inner;
}

if (missing.length) {
  console.warn(`[icons] not found: ${missing.join(", ")}`);
}

const body = `/**
 * GENERATED — do not edit. Run \`npm run icons\` in engine/ to rebuild.
 *
 * Brand marks from simple-icons (CC0-1.0), drawn in a 24x24 box as one filled
 * path. Outline glyphs from lucide (ISC), stroked rather than filled, which is
 * why they take the template's colour and the brands can keep their own.
 */

export type BrandIcon = { path: string; hex: string; title: string };

export const BRAND_ICONS: Record<string, BrandIcon> = ${JSON.stringify(out.brands, null, 2)};

export const GLYPH_ICONS: Record<string, string> = ${JSON.stringify(out.glyphs, null, 2)};

/** Every name a template may use, for the schema and the spec sheet. */
export const ICON_NAMES = [
  ...Object.keys(BRAND_ICONS),
  ...Object.keys(GLYPH_ICONS),
].sort();
`;

const target = path.join(here, "..", "src", "authoring", "icons.ts");
fs.writeFileSync(target, body);
console.log(
  `[icons] ${Object.keys(out.brands).length} brands + ${Object.keys(out.glyphs).length} glyphs → ${target}`,
);
