import "./index.css";
// Side-effect import: registers the @font-face rules and holds rendering until
// the brand faces are loaded. Must come before any composition renders.
import "./brand/loadFonts";
import { CalculateMetadataFunction, Composition } from "remotion";
import { formats } from "./brand/tokens";
import { APP_ICON_SIZE, AppIcon } from "./AppIcon";
import { compositionId, registry } from "./registry";
import { ALPHA_PROOF_DURATION, AlphaProof } from "./templates/AlphaProof/AlphaProof";

export const FPS = 30;

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
