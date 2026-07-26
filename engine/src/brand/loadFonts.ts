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

import { continueRender, delayRender, staticFile } from "remotion";

type Face = { family: string; weight: string; file: string };

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
];

const handle = delayRender("Loading brand fonts");

if (typeof document === "undefined" || typeof FontFace === "undefined") {
  continueRender(handle);
} else {
  Promise.all(
    FACES.map(async ({ family, weight, file }) => {
      const face = new FontFace(family, `url(${staticFile(file)}) format('woff2')`, {
        weight,
      });
      document.fonts.add(await face.load());
    }),
  )
    .then(() => continueRender(handle))
    .catch(() => {
      // Never hang a render over a font. Falling back to the system stack is a
      // visible cosmetic problem; a stalled render is a broken product.
      continueRender(handle);
    });
}

export {};
