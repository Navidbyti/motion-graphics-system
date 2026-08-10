/**
 * Find an icon by whatever it was called.
 *
 * The first version rejected a whole template because it asked for "bucket" and
 * the set had no such name — one unknown word discarded a working ten-layer
 * graphic. That is the wrong trade every time. A template that renders with a
 * near-miss icon can be corrected in the panel; a template that does not exist
 * cannot be corrected at all.
 *
 * So nothing here fails. It matches exactly, then loosely, and only draws a
 * neutral mark when there is genuinely nothing close — which with 2,000 glyphs
 * bundled is rare enough to be a curiosity rather than a workflow.
 */

import { BRAND_ICONS, GLYPH_ICONS, ICON_NAMES } from "./icons";

const normalise = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");

/** Words that mean the same thing to a person and different things to a lookup. */
const SYNONYMS: Record<string, string> = {
  bucket: "paint-bucket",
  jar: "container",
  tick: "check",
  cross: "x",
  close: "x",
  money: "banknote",
  cash: "banknote",
  savings: "piggy-bank",
  bank: "landmark",
  chart: "chart-column",
  graph: "chart-line",
  growth: "trending-up",
  up: "trending-up",
  down: "trending-down",
  fire: "flame",
  lightning: "zap",
  time: "clock",
  warning: "circle-alert",
  alert: "circle-alert",
  tick_circle: "circle-check",
  hotel: "bed",
  travel: "plane",
  flight: "plane",
  location: "map-pin",
  world: "globe",
  people: "users",
  person: "user",
  email: "mail",
  gear: "settings",
  cog: "settings",
  coin: "coins",
  crypto: "bitcoin",
  btc: "bitcoin",
  eth: "ethereum",
  twitter: "x",
};

const NORMALISED = new Map<string, string>();
for (const name of ICON_NAMES) NORMALISED.set(normalise(name), name);

export type ResolvedIcon =
  | { kind: "brand"; name: string; path: string; hex: string; exact: boolean }
  | { kind: "glyph"; name: string; markup: string; exact: boolean }
  | { kind: "none" };

/**
 * The closest icon to what was asked for.
 *
 * Ordered from certain to speculative, and it stops at the first hit rather
 * than scoring everything — a name that exactly matches should never lose to a
 * cleverer match further down.
 */
export const resolveIcon = (requested: string): ResolvedIcon => {
  const wanted = (requested ?? "").trim();
  if (!wanted) return { kind: "none" };

  const asked = normalise(wanted);
  const build = (name: string, exact: boolean): ResolvedIcon => {
    const brand = BRAND_ICONS[name];
    if (brand) return { kind: "brand", name, path: brand.path, hex: brand.hex, exact };
    const glyph = GLYPH_ICONS[name];
    if (glyph) return { kind: "glyph", name, markup: glyph, exact };
    return { kind: "none" };
  };

  // 1. Exactly what was asked for.
  const exact = NORMALISED.get(asked);
  if (exact) return build(exact, true);

  // 2. A word people use for a thing the set calls something else.
  const synonym = SYNONYMS[wanted.toLowerCase().replace(/[^a-z0-9]+/g, "_")] ?? SYNONYMS[asked];
  if (synonym && NORMALISED.has(normalise(synonym))) {
    return build(NORMALISED.get(normalise(synonym))!, false);
  }

  /*
    3. One name inside the other — but the two directions want opposite rules,
       and treating them the same picked nonsense.

       An icon name INSIDE the request should be the longest: "rocket-ship"
       contains both "rocket" and "ship", and "rocket" is obviously what was
       meant. Shortest-wins gave "ship".

       The request inside an icon NAME should be the shortest: "chart" should
       reach "chart-line", not "chart-no-axes-gantt".

       Three characters minimum either way. Below that the matches are
       accidental — "ad" is a substring of "completely-made-up", and answering
       a nonsense word with an advertising icon is worse than answering nothing.
  */
  if (asked.length >= 3) {
    const insideRequest = ICON_NAMES.filter(
      (n) => normalise(n).length >= 3 && asked.includes(normalise(n)),
    ).sort((a, b) => normalise(b).length - normalise(a).length);
    if (insideRequest.length) return build(insideRequest[0], false);

    const containsRequest = ICON_NAMES.filter((n) =>
      normalise(n).includes(asked),
    ).sort((a, b) => normalise(a).length - normalise(b).length);
    if (containsRequest.length) return build(containsRequest[0], false);
  }

  /*
    4. A shared word. "money-bag" has no entry, but "bag" does, and a bag is a
       better answer than nothing at all.
  */
  const words = wanted.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 3);
  for (const word of words) {
    const hit = ICON_NAMES.find((n) => normalise(n).includes(normalise(word)));
    if (hit) return build(hit, false);
  }

  return { kind: "none" };
};
