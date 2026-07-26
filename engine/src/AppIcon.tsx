/**
 * APP ICON — a render target, not a template.
 *
 * Deliberately not in the registry: it must never appear in the editor's
 * Library. It exists so the icon can be regenerated from its SVG source with
 * the same renderer everything else uses, rather than requiring ImageMagick or
 * an online converter.
 *
 *   npx remotion still src/index.ts AppIcon ../app/build-resources/icon.png
 *
 * electron-builder turns that PNG into a multi-resolution .ico at build time.
 */

import { AbsoluteFill, Img, staticFile } from "remotion";

export const APP_ICON_SIZE = 1024;

export const AppIcon: React.FC = () => (
  // No background: the source SVG draws its own rounded square, and anything
  // behind it would show as square corners in the final .ico.
  <AbsoluteFill>
    <Img src={staticFile("icon.svg")} style={{ width: "100%", height: "100%" }} />
  </AbsoluteFill>
);
