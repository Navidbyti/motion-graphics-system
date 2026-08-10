/**
 * A pasted file → a Library entry.
 *
 * After this, nothing downstream knows the difference. The Library card, the
 * generated form, the brand picker, the colour tuner, Build mode, the export —
 * all of it reads a registry entry, so producing one is the entire integration.
 * The alternative was a parallel path for pasted templates through every screen,
 * which is two of everything and one of them permanently less good.
 */

import React from "react";
import type { z } from "zod";
import { withCommon } from "../templates/fields";
import type { AnyTemplateEntry, FormatName } from "../registry";
import { CustomTemplate, customDurationInFrames } from "./CustomTemplate";
import { fieldDefaults, fieldsToZod } from "./fieldsToZod";
import type { TemplateFile } from "./format";

/** Marks an entry as pasted, so the app can offer Remove and Export file. */
export type CustomEntry = AnyTemplateEntry & {
  custom: true;
  /** The definition, needed to render and to send to the render server. */
  file: TemplateFile;
};

export const isCustomEntry = (entry: AnyTemplateEntry): entry is CustomEntry =>
  (entry as CustomEntry).custom === true;

const ALL_FORMATS: readonly FormatName[] = ["vertical", "square", "landscape"];

export const customToEntry = (file: TemplateFile): CustomEntry => {
  /*
    The template's own fields, plus the same common set every built-in gets.
    Brand, theme, sizing and direction are not the template author's business —
    they belong to whoever is using it, and a pasted template that could not be
    rebranded would be the one kind that does not fit the library.
  */
  const schema = withCommon(fieldsToZod(file.fields).shape) as z.ZodTypeAny;

  const defaults = {
    ...fieldDefaults(file.fields),
    brand: "hoteldebit",
    scale: 1,
    direction: "auto",
    speed: 1,
  };

  /*
    The component closes over the definition, so the props flowing through the
    app are just the editor's field values — the same shape a built-in template
    receives. The template itself is not in the props here; it is added back on
    the way to the renderer, where the composition needs it.
  */
  const component: React.FC<Record<string, unknown>> = (props) => (
    <CustomTemplate
      template={file}
      values={props}
      brand={String(props.brand ?? "hoteldebit")}
      theme={props.theme as never}
      scale={Number(props.scale ?? 1)}
      direction={(props.direction as "auto" | "ltr" | "rtl") ?? "auto"}
      speed={Number(props.speed ?? 1)}
    />
  );

  return {
    custom: true,
    file,
    id: file.id,
    title: file.title,
    blurb: file.description,
    tags: file.tags,
    component,
    schema,
    defaults,
    formats: ALL_FORMATS,
    // Pasted templates are overlays: they are built to sit over footage, and
    // the transparent preset is the one people actually want from this app.
    overlay: true,
    // The fps the app is running at, not a baked-in 30 — the entry contract
    // passes it in precisely so nothing has to assume.
    /*
      Speed shortens the graphic as well as quickening it. "Twice as fast" that
      still runs twelve seconds is not twice as fast, it is the same length with
      eight seconds of nothing at the end.
    */
    durationInFrames: (props: Record<string, unknown>, fps: number) =>
      Math.max(
        1,
        Math.round(customDurationInFrames(file, fps) / (Number(props?.speed) || 1)),
      ),
  };
};

/**
 * What the render server needs for a pasted template.
 *
 * The composition is `Custom-<Format>`, not one named after the template —
 * that composition is the only one that exists in a bundle built before the
 * template was written. The definition travels beside the values.
 */
export const customRenderProps = (file: TemplateFile, values: Record<string, unknown>) => ({
  template: file,
  values,
  brand: values.brand ?? "hoteldebit",
  theme: values.theme,
  scale: values.scale,
  direction: values.direction,
  speed: values.speed,
});
