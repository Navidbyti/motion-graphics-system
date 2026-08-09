import "./index.css";
// Side-effect import: registers the @font-face rules and holds rendering until
// the brand faces are loaded. Must come before any composition renders.
import "./brand/loadFonts";
import { CalculateMetadataFunction, Composition } from "remotion";
import { formats } from "./brand/tokens";
import { APP_ICON_SIZE, AppIcon } from "./AppIcon";
import { compositionId, registry } from "./registry";
import { ALPHA_PROOF_DURATION, AlphaProof } from "./templates/AlphaProof/AlphaProof";
import {
  CustomComposition,
  customCompositionId,
  customMetadata,
} from "./authoring/CustomComposition";
import { customDurationInFrames } from "./authoring/CustomTemplate";
import { exampleTemplate } from "./authoring/example";
import { fieldDefaults } from "./authoring/fieldsToZod";

export { FPS } from "./fps";
import { FPS } from "./fps";

/**
 * Render settings for the Overlay preset, in one place.
 *
 * These deliberately do NOT live in a template's calculateMetadata. Baking in
 * `defaultProResProfile` makes the composition impossible to render as anything
 * else — `--codec=h264` hard-errors — which would break the cheap previews and
 * thumbnails the app generates constantly. Export settings belong to the
 * *preset*; both the npm scripts and scripts/render-service.mjs read from here.
 */
export const OVERLAY_RENDER_SETTINGS = {
  codec: "prores",
  proResProfile: "4444",
  pixelFormat: "yuva444p10le",
  imageFormat: "png",
} as const;

const overlayDefaults = {
  defaultCodec: "prores",
  defaultVideoImageFormat: "png",
  defaultPixelFormat: "yuva444p10le",
  defaultProResProfile: "4444",
} as const;

export const transparentOverlay: CalculateMetadataFunction<
  Record<string, unknown>
> = async () => overlayDefaults;

/**
 * Compositions are generated from the registry rather than written by hand, so
 * a new template is one registry entry instead of three near-identical blocks
 * that can drift apart.
 */
export const RemotionRoot: React.FC = () => {
  return (
    <>
      {registry.flatMap((template) =>
        template.formats.map((format) => {
          const metadata: CalculateMetadataFunction<Record<string, never>> = async ({
            props,
          }) => ({
            durationInFrames: template.durationInFrames(props, FPS),
          });

          return (
            <Composition
              key={compositionId(template.id, format)}
              id={compositionId(template.id, format)}
              component={template.component}
              schema={template.schema}
              defaultProps={template.defaults}
              durationInFrames={template.durationInFrames(template.defaults, FPS)}
              fps={FPS}
              width={formats[format].width}
              height={formats[format].height}
              calculateMetadata={metadata}
            />
          );
        }),
      )}

      {/*
        PASTED TEMPLATES.

        One composition per format, and the template itself arrives in
        inputProps rather than being one of the entries above. That is the
        whole mechanism: the bundle is built when the app is packaged, so a
        composition can only exist for a template that existed then. Carrying
        the definition in props instead means a template written a year later
        renders through a bundle that has never heard of it, with nothing
        recompiled and nothing rebuilt.

        `calculateMetadata` reads the duration back out of that same prop, so a
        pasted template controls its own length exactly as a built-in one does.
      */}
      {(Object.keys(formats) as (keyof typeof formats)[]).map((format) => (
        <Composition
          key={`Custom-${format}`}
          id={customCompositionId(format)}
          component={CustomComposition}
          defaultProps={{
            template: exampleTemplate,
            values: fieldDefaults(exampleTemplate.fields),
            brand: "hoteldebit",
          }}
          durationInFrames={customDurationInFrames(exampleTemplate, FPS)}
          fps={FPS}
          width={formats[format].width}
          height={formats[format].height}
          calculateMetadata={customMetadata}
        />
      ))}

      {/* Render target for the app icon. Not a template — never in the Library. */}
      <Composition
        id="AppIcon"
        component={AppIcon}
        durationInFrames={1}
        fps={FPS}
        width={APP_ICON_SIZE}
        height={APP_ICON_SIZE}
      />

      {/* Phase 1 diagnostic. Kept so the alpha path stays regression-testable. */}
      <Composition
        id="AlphaProof-Vertical"
        component={AlphaProof}
        durationInFrames={ALPHA_PROOF_DURATION}
        fps={FPS}
        width={formats.vertical.width}
        height={formats.vertical.height}
        calculateMetadata={transparentOverlay}
      />
    </>
  );
};
