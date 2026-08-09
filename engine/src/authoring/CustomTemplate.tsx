/**
 * THE INTERPRETER — renders any valid pasted template.
 *
 * One component, compiled into the bundle when the app is packaged. A template
 * pasted a year later renders through this without anything being rebuilt,
 * because the template is data arriving in props rather than code that has to
 * exist at build time.
 *
 * This is also where every decision a template is NOT allowed to make gets
 * made, once: what a spring feels like, how an exit is timed, how text is
 * revealed without breaking Arabic shaping, how a layer stays clear of the
 * platform's own UI. A template says what and when. Everything about HOW lives
 * here, where it can be fixed for every template at the same time.
 */

import React from "react";
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { getBrand } from "../brand/brands";
import { useTheme } from "../brand/useTheme";
import type { ThemeInput } from "../brand/theme";
import { radius as radiusTokens, safe, shadow as shadowTokens, type, weight } from "../brand/tokens";
import { EASE, enter, exit, sec } from "../motion";
import { useLayout } from "../layout";
import { detectDirection } from "../layout";
import type { TemplateFile, TemplateLayer } from "./format";

export type CustomTemplateProps = {
  /** The pasted file, already validated. */
  template: TemplateFile;
  /** What the editor typed into the generated form. */
  values: Record<string, unknown>;
  brand: string;
  theme?: ThemeInput | null;
  scale?: number;
  direction?: "auto" | "ltr" | "rtl";
};

/* ------------------------------------------------------------------ *
 * Resolving what a template names
 * ------------------------------------------------------------------ */

const MUSTACHE = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g;

/**
 * `{{field}}` → the editor's value.
 *
 * An unknown reference resolves to empty rather than rendering the braces. The
 * paste step already rejects references to fields that do not exist, so
 * reaching this case means the values object is thinner than the template — and
 * a blank is a recoverable graphic where `{{price}}` on screen is not.
 */
const fill = (source: string, values: Record<string, unknown>) =>
  source.replace(MUSTACHE, (_, key: string) => {
    const v = values[key];
    return v === undefined || v === null ? "" : String(v);
  });

type Palette = ReturnType<typeof getBrand>["palette"];

const resolveColor = (
  value: string | undefined,
  palette: Palette,
  values: Record<string, unknown>,
): string | undefined => {
  if (!value) return undefined;
  if (value === "transparent") return "transparent";

  // A field reference wins first — the editor's colour tuner writes here.
  if (MUSTACHE.test(value)) {
    MUSTACHE.lastIndex = 0;
    const filled = fill(value, values).trim();
    // An empty colour field means "follow the brand", which is what `undefined`
    // means to every caller below. Blank is not black.
    if (!filled) return undefined;
    return filled in palette ? palette[filled as keyof Palette] : filled;
  }
  MUSTACHE.lastIndex = 0;

  return value in palette ? palette[value as keyof Palette] : value;
};

const RADIUS: Record<string, number> = { ...radiusTokens, none: 0 };

const ANCHOR_SHIFT: Record<string, [number, number]> = {
  topLeft: [0, 0],
  top: [-50, 0],
  topRight: [-100, 0],
  left: [0, -50],
  center: [-50, -50],
  right: [-100, -50],
  bottomLeft: [0, -100],
  bottom: [-50, -100],
  bottomRight: [-100, -100],
};

/* ------------------------------------------------------------------ *
 * One layer
 * ------------------------------------------------------------------ */

const Layer: React.FC<{
  layer: TemplateLayer;
  values: Record<string, unknown>;
  brand: ReturnType<typeof getBrand>;
  layout: ReturnType<typeof useLayout>;
  fallbackDirection: "auto" | "ltr" | "rtl";
}> = ({ layer, values, brand, layout, fallbackDirection }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const { px, width, height, isVertical } = layout;
  const { palette } = brand;

  const delay = sec(layer.motion.at, fps);

  /*
    Entrance progress. `enter` is a spring whose character comes from the brand,
    which is what stops a pasted template from feeling like it came from a
    different app — the same graphic moves differently under a playful brand
    than under a premium one, without the template knowing either exists.
  */
  const progress =
    layer.motion.in === "none" ? (frame >= delay ? 1 : 0) : enter({ frame, fps, delay, spring: brand.motion.entrance });

  /*
    Leaving. `until` wins if it is set, otherwise the layer rides the
    composition's own ending. Exits run shorter than entrances by design: the
    viewer has already read it.
  */
  const exitSeconds = 0.35;
  const leaving =
    layer.motion.until !== undefined
      ? interpolate(
          frame,
          [sec(layer.motion.until - exitSeconds, fps), sec(layer.motion.until, fps)],
          [1, 0],
          { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE.out },
        )
      : layer.motion.out
        ? exit({ frame, fps, durationInFrames, duration: exitSeconds })
        : 1;

  // Nothing to draw before it arrives. Worth an early return rather than a
  // zero-opacity element: a 40-layer template would otherwise composite forty
  // invisible boxes on every frame of the render.
  if (frame < delay && layer.motion.in !== "none") return null;
  if (leaving <= 0) return null;

  /* ------------------------------- placement ------------------------------ */

  const inset = layer.box.safe
    ? {
        x: px(safe.x),
        top: px(safe.top),
        // Vertical social hides its lower strip behind captions and buttons.
        bottom: px(isVertical ? safe.socialBottom : safe.bottom),
      }
    : { x: 0, top: 0, bottom: 0 };

  const availableW = Math.max(width - inset.x * 2, 1);
  const availableH = Math.max(height - inset.top - inset.bottom, 1);

  const [shiftX, shiftY] = ANCHOR_SHIFT[layer.box.anchor] ?? ANCHOR_SHIFT.center;

  const entranceTransform =
    layer.motion.in === "fadeUp"
      ? `translateY(${interpolate(progress, [0, 1], [px(48), 0])}px)`
      : layer.motion.in === "scaleIn"
        ? `scale(${interpolate(progress, [0, 1], [0.94, 1])})`
        : "";

  const opacity =
    layer.opacity *
    leaving *
    (layer.motion.in === "wipeUp" || layer.motion.in === "typewriter"
      ? 1
      : interpolate(progress, [0, 1], [0, 1], { extrapolateRight: "clamp" }));

  const frameStyle: React.CSSProperties = {
    position: "absolute",
    left: inset.x + (layer.box.x / 100) * availableW,
    top: inset.top + (layer.box.y / 100) * availableH,
    width: layer.box.w === undefined ? undefined : (layer.box.w / 100) * availableW,
    height: layer.box.h === undefined ? undefined : (layer.box.h / 100) * availableH,
    transform: [
      `translate(${shiftX}%, ${shiftY}%)`,
      layer.box.rotate ? `rotate(${layer.box.rotate}deg)` : "",
      entranceTransform,
    ]
      .filter(Boolean)
      .join(" "),
    opacity,
    // Only meaningful for wipeUp; harmless otherwise.
    clipPath:
      layer.motion.in === "wipeUp"
        ? `inset(${interpolate(progress, [0, 1], [100, 0], { extrapolateRight: "clamp" })}% 0 0 0)`
        : undefined,
  };

  /* -------------------------------- content ------------------------------- */

  if (layer.type === "text") {
    const text = fill(layer.value, values);
    // Nothing to lay out, and an empty reveal would build a zero-width
    // interpolation range — the crash this project has already shipped once.
    if (!text.trim()) return null;

    const size =
      typeof layer.style.size === "number"
        ? layer.style.size
        : type[layer.style.size];

    const dir =
      layer.style.direction === "auto"
        ? detectDirection(text)
        : layer.style.direction === "ltr" || layer.style.direction === "rtl"
          ? layer.style.direction
          : fallbackDirection === "auto"
            ? detectDirection(text)
            : fallbackDirection;

    const textStyle: React.CSSProperties = {
      margin: 0,
      fontFamily: brand.font[layer.style.font],
      fontSize: px(size),
      fontWeight: weight[layer.style.weight],
      color: resolveColor(layer.style.color, palette, values) ?? palette.textPrimary,
      textAlign: layer.style.align,
      lineHeight: layer.style.lineHeight,
      letterSpacing: `${layer.style.letterSpacing}em`,
      textTransform: layer.style.transform === "none" ? undefined : layer.style.transform,
      direction: dir,
      whiteSpace: "pre-wrap",
    };

    if (layer.motion.in !== "typewriter") {
      return <div style={frameStyle}><p style={textStyle}>{text}</p></div>;
    }

    /*
      Word-by-word reveal, clipped PER WORD rather than across the block.
      Clipping the whole paragraph looked right on one line and wrong on three —
      it wiped the entire block instead of writing it. Per-word clipping also
      keeps Arabic and Persian shaping intact, which splitting into characters
      destroys: the letters join, and a per-character reveal renders them in
      isolated forms.
    */
    const words = text.split(/(\s+)/);
    const step = Math.max(sec(layer.motion.stagger, fps), 1);
    return (
      <div style={frameStyle}>
        <p style={textStyle}>
          {words.map((word, i) => {
            if (!word.trim()) return <React.Fragment key={i}>{word}</React.Fragment>;
            const wordProgress = enter({
              frame,
              fps,
              delay: delay + Math.floor(i / 2) * step,
              spring: brand.motion.entrance,
            });
            return (
              <span
                key={i}
                style={{
                  display: "inline-block",
                  clipPath: `inset(0 ${interpolate(wordProgress, [0, 1], [100, 0], {
                    extrapolateRight: "clamp",
                  })}% 0 0)`,
                }}
              >
                {word}
              </span>
            );
          })}
        </p>
      </div>
    );
  }

  if (layer.type === "shape") {
    const fillColor = resolveColor(layer.fill, palette, values) ?? palette.surface;
    const strokeColor = resolveColor(layer.stroke, palette, values);

    if (layer.shape === "line") {
      return (
        <div
          style={{
            ...frameStyle,
            height: px(Math.max(layer.strokeWidth, 2)),
            background: strokeColor ?? fillColor,
            borderRadius: px(RADIUS.pill),
          }}
        />
      );
    }

    return (
      <div
        style={{
          ...frameStyle,
          background: fillColor,
          opacity: (frameStyle.opacity as number) * layer.fillOpacity,
          borderRadius:
            layer.shape === "ellipse" ? "50%" : px(RADIUS[layer.radius] ?? RADIUS.md),
          border:
            strokeColor && layer.strokeWidth > 0
              ? `${px(layer.strokeWidth)}px solid ${strokeColor}`
              : undefined,
          boxShadow: layer.shadow ? shadowTokens.soft : undefined,
        }}
      />
    );
  }

  if (layer.type === "image") {
    const src = fill(layer.src, values);
    if (!src) return null;
    return (
      <div style={{ ...frameStyle, overflow: "hidden", borderRadius: px(RADIUS[layer.radius] ?? 0) }}>
        <img
          src={src}
          style={{ width: "100%", height: "100%", objectFit: layer.fit, display: "block" }}
        />
      </div>
    );
  }

  if (layer.type === "logo") {
    const src = brand.logo.src;
    // Brands without a logo file render nothing rather than a broken image or a
    // placeholder that would ship into someone's video.
    if (!src) return null;
    const tint = resolveColor(layer.tint, palette, values);
    return (
      <div style={frameStyle}>
        <img
          src={src}
          style={{
            height: layer.box.h === undefined ? px(80) : "100%",
            width: "auto",
            display: "block",
            filter: tint ? `drop-shadow(0 0 0 ${tint})` : undefined,
          }}
        />
      </div>
    );
  }

  return null;
};

/* ------------------------------------------------------------------ */

export const CustomTemplate: React.FC<CustomTemplateProps> = ({
  template,
  values,
  brand: brandId,
  theme,
  scale,
  direction = "auto",
}) => {
  useTheme(brandId, theme);
  const brand = getBrand(brandId);
  const layout = useLayout({ scale, direction });

  return (
    <div style={{ position: "absolute", inset: 0 }}>
      {/*
        Array order is drawing order — later layers sit on top. The same rule
        the annotation list uses, so there is one thing to learn rather than two.
      */}
      {template.layers.map((layer) => (
        <Layer
          key={layer.id}
          layer={layer}
          values={values}
          brand={brand}
          layout={layout}
          fallbackDirection={direction}
        />
      ))}
    </div>
  );
};

/** How long a pasted template runs, in frames. */
export const customDurationInFrames = (template: TemplateFile, fps: number) =>
  Math.max(1, Math.round(template.seconds * fps));
