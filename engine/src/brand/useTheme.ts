/**
 * useTheme — resolve the brand AND load any custom font it needs.
 *
 * Templates call this instead of `resolveTheme()` directly, so a user-supplied
 * font is registered before the first frame renders rather than popping in
 * halfway through.
 *
 * The font travels as a data URL inside the theme, not as a file path or a URL
 * to fetch. Three reasons:
 *   - the renderer is a separate process from the UI, so a path chosen in
 *     Settings may not exist or resolve the same way there;
 *   - the template contract forbids network calls at render time;
 *   - it means the preview and the export are loading byte-identical data, so
 *     they cannot disagree about what the font is.
 */

import { useEffect, useState } from "react";
import { continueRender, delayRender } from "remotion";
import { type BrandDefinition } from "./brands";
import { type ThemeInput, resolveTheme } from "./theme";

export const useTheme = (
  brand: string,
  theme?: ThemeInput | null,
): BrandDefinition => {
  const name = theme?.customFontName;
  const data = theme?.customFontData;
  const needsFont = Boolean(brand === "custom" && name && data);

  // Held for the lifetime of the render so no frame draws in a fallback face.
  const [handle] = useState(() =>
    needsFont ? delayRender(`Loading custom font ${name}`) : null,
  );

  useEffect(() => {
    if (handle === null) return;
    if (!name || !data) return continueRender(handle);

    let cancelled = false;
    new FontFace(name, `url(${data})`)
      .load()
      .then((face) => {
        if (cancelled) return;
        document.fonts.add(face);
        continueRender(handle);
      })
      .catch(() => {
        // Never hang a render over a font. A wrong typeface is a cosmetic
        // problem; a render that never completes is a broken product.
        if (!cancelled) continueRender(handle);
      });

    return () => {
      cancelled = true;
    };
  }, [handle, name, data]);

  return resolveTheme(brand, theme);
};
