/**
 * The bridge between "some JSON arrived in inputProps" and the interpreter.
 *
 * Its one job is to run the incoming template through the schema before
 * anything renders. That is not paranoia about the app — the app validates on
 * paste — it is where the DEFAULTS get applied. A template that omits `motion`
 * on a layer, or `anchor` on a box, is valid and extremely common, and without
 * a parse here the interpreter would read undefined for every unstated
 * property. Parsing is what lets the format have sensible omissions at all.
 */

import React from "react";
import { CalculateMetadataFunction } from "remotion";
import { formats } from "../brand/tokens";
import { FPS } from "../fps";
import { CustomTemplate, customDurationInFrames } from "./CustomTemplate";
import { templateFileSchema } from "./format";
import type { ThemeInput } from "../brand/theme";

export type CustomCompositionProps = {
  /** The pasted file as plain JSON — parsed here, not before. */
  template: unknown;
  values?: Record<string, unknown>;
  brand?: string;
  theme?: ThemeInput | null;
  scale?: number;
  direction?: "auto" | "ltr" | "rtl";
  speed?: number;
};

export const customCompositionId = (format: keyof typeof formats) =>
  `Custom-${format[0].toUpperCase()}${format.slice(1)}`;

export const CustomComposition: React.FC<CustomCompositionProps> = ({
  template,
  values = {},
  brand = "hoteldebit",
  theme,
  scale,
  direction,
  speed,
}) => {
  const parsed = templateFileSchema.safeParse(template);

  if (!parsed.success) {
    /*
      Thrown, not drawn.

      An error card rendered into the frame would export as a finished video
      with an error card in it — a file that looks deliverable and is not. A
      throw fails the render, which is what the editor needs to see.
    */
    const first = parsed.error.issues[0];
    throw new Error(
      `This template is not valid: ${first.path.join(".") || "(root)"} — ${first.message}`,
    );
  }

  return (
    <CustomTemplate
      template={parsed.data}
      values={values}
      brand={brand}
      theme={theme}
      scale={scale}
      direction={direction}
      speed={speed}
    />
  );
};

/**
 * Duration comes from the template itself, so a pasted template controls its
 * own length the same way a built-in one does.
 */
export const customMetadata: CalculateMetadataFunction<CustomCompositionProps> = async ({
  props,
  defaultProps,
}) => {
  const parsed = templateFileSchema.safeParse(props.template ?? defaultProps.template);
  return {
    durationInFrames: parsed.success
      ? Math.max(
          1,
          // Matches the entry's own calculation, or the export would be a
          // different length from the preview.
          Math.round(
            customDurationInFrames(parsed.data, FPS) / (Number(props.speed) || 1),
          ),
        )
      : // An invalid template still needs a length, or Remotion cannot build the
        // composition far enough to report the real problem from the component.
        FPS,
  };
};
