/**
 * BRAND FONTS — self-hosted, registered at runtime.
 *
 * Not loaded from Google's CDN. Two reasons, either fatal alone:
 *
 *  1. fonts.gstatic.com is geo-blocked from this location — the same block that
 *     stops Remotion downloading its Chrome. A CDN link renders every template
 *     in a fallback face with no error at all.
 *  2. The template contract forbids network calls at render time. A font that
 *     loads over the wire is a render that can silently change or fail.
 *
 * Registered via the FontFace API with `staticFile()` rather than an
 * `@font-face` stylesheet: webpack tries to resolve `url(/fonts/…)` in CSS as a
 * module and fails the build, since public/ isn't part of the module graph.
 *
 * `delayRender` holds every frame until the faces resolve. Without it the
 * browser loads fonts lazily, so early frames render in the fallback and later
 * frames switch — a font pop mid-video that's easy to miss in preview and
 * obvious on a timeline.
 */

import { useEffect, useState } from "react";
import { continueRender, delayRender, staticFile } from "remotion";
import { MARCELLUS_WOFF2 } from "./fontData";

type Face = {
  family: string;
  weight: string;
  file?: string;
  /** Inline base64 src — bypasses staticFile path/timing issues entirely. */
  dataUri?: string;
  range?: string;
};

/**
 * Inter ships as a single variable font — Google serves the identical file for
 * every weight — so it declares a 100–900 range instead of five faces.
 * Poppins is five static weights.
 */
const FACES: Face[] = [
  { family: "Inter", weight: "100 900", file: "fonts/inter-variable.woff2" },
  { family: "Poppins", weight: "400", file: "fonts/poppins-400.woff2" },
  { family: "Poppins", weight: "500", file: "fonts/poppins-500.woff2" },
  { family: "Poppins", weight: "600", file: "fonts/poppins-600.woff2" },
  { family: "Poppins", weight: "700", file: "fonts/poppins-700.woff2" },
  { family: "Poppins", weight: "900", file: "fonts/poppins-900.woff2" },

  /**
   * Nestie's own faces, read off nestie.com: Playfair Display 900 carries the
   * hero line, DM Sans does everything else. Fetched from the jsdelivr mirror
   * of @fontsource rather than Google — gstatic is geo-blocked here, jsdelivr
   * is not — then self-hosted like the rest.
   */
  { family: "Marcellus", weight: "400", dataUri: MARCELLUS_WOFF2 }, // LOCKED display face (inline)

  /**
   * Vazirmatn covers Persian/Arabic script, which Inter and Poppins do not —
   * they render Persian as tofu boxes or fall back to whatever the OS supplies,
   * which differs between machines and breaks the whole point of self-hosting.
   *
   * Two subsets, one variable file each. The Arabic subset is declared with an
   * explicit unicode-range so Latin text in a mixed string still renders in the
   * Latin cut rather than Vazirmatn's Latin, which has different metrics.
   */
  {
    family: "Vazirmatn",
    weight: "100 900",
    file: "fonts/vazirmatn-latin.woff2",
    /**
     * This range is NOT optional.
     *
     * A FontFace with no unicodeRange claims all of Unicode (U+0-10FFFF). The
     * Latin subset was registered without one, so Persian characters matched it
     * first, found no glyphs, and fell back to whatever the OS had — Vazirmatn
     * appeared "loaded" while rendering nothing. Constraining it to Latin means
     * Arabic codepoints can only match the Arabic face below.
     */
    range:
      "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, " +
      "U+0304, U+0308, U+0329, U+2000-206F, U+2074, U+20AC, U+2122, U+2191, " +
      "U+2193, U+2212, U+2215, U+FEFF, U+FFFD",
  },
  {
    family: "Vazirmatn",
    weight: "100 900",
    file: "fonts/vazirmatn-arabic.woff2",
    range:
      "U+0600-06FF, U+0750-077F, U+08A0-08FF, U+FB50-FDFF, U+FE70-FEFF, U+200C-200E, U+2010-2011, U+204F, U+2E41",
  },
];

const handle = delayRender("Loading brand fonts");

if (typeof document === "undefined" || typeof FontFace === "undefined") {
  continueRender(handle);
} else {
  // allSettled, NOT all: with Promise.all, one font failing to load (a missing
  // file, a rejected face) rejects the whole batch immediately and fires
  // continueRender EARLY — so slower faces (Marcellus) are captured before they
  // finish and the frame falls back to a system serif. allSettled waits for
  // every face to resolve OR fail before the render proceeds, so a single bad
  // font can't knock out the others. (This is why Marcellus rendered as Playfair
  // for six attempts while Inter loaded fine — a load race, not a bad file.)
  Promise.allSettled(
    FACES.map(async ({ family, weight, file, dataUri, range }) => {
      const src = dataUri
        ? `url(${dataUri}) format('woff2')`
        : `url(${staticFile(file as string)}) format('${(file as string).endsWith(".ttf") ? "truetype" : "woff2"}')`;
      const face = new FontFace(family, src, {
        weight,
        ...(range ? { unicodeRange: range } : {}),
      });
      document.fonts.add(await face.load());
    }),
  ).then(() => continueRender(handle));
}

/**
 * Component-lifecycle font loader — the reliable pattern.
 *
 * The module-level delayRender above does NOT gate a `still`/frame render: the
 * frame is captured before the async FontFace loads finish, so every custom
 * face silently falls back to a system font (Marcellus -> a serif, Inter ->
 * Segoe UI). Calling delayRender in state + continueRender in an effect ties
 * the hold to THIS composition's render, so the frame waits for the fonts.
 * Call `useBrandFonts()` once at the top of any template that needs them.
 */
export const useBrandFonts = (): void => {
  const [handle] = useState(() => delayRender("brand fonts (component)"));
  useEffect(() => {
    let alive = true;
    Promise.allSettled(
      FACES.map(async ({ family, weight, file, dataUri, range }) => {
        const src = dataUri
          ? `url(${dataUri}) format('woff2')`
          : `url(${staticFile(file as string)}) format('${(file as string).endsWith(".ttf") ? "truetype" : "woff2"}')`;
        const face = new FontFace(family, src, {
          weight,
          ...(range ? { unicodeRange: range } : {}),
        });
        document.fonts.add(await face.load());
      }),
    ).then(() => {
      if (alive) continueRender(handle);
    });
    return () => {
      alive = false;
      continueRender(handle);
    };
  }, [handle]);
};

export {};
