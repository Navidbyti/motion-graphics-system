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
import {
  AbsoluteFill,
  Img,
  Sequence,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { getBrand } from "../brand/brands";
import { useTheme } from "../brand/useTheme";
import type { ThemeInput } from "../brand/theme";
import { radius as radiusTokens, safe, shadow as shadowTokens, type, weight } from "../brand/tokens";
import { EASE, enter, sec } from "../motion";
import { useLayout } from "../layout";
import { detectDirection } from "../layout";
import { Plot } from "../charting/Plot";
import { MacdPanel } from "../charting/MacdPanel";
import { AnnotationLayer } from "../charting/AnnotationLayer";
import { annotationPrices, type Annotation } from "../charting/annotations";
import { priceScale, type Bar } from "../charting/geometry";
import { indicator } from "../charting/indicators";
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
 * A number, or zero.
 *
 * Chart rows arrive from a spreadsheet paste or a market fetch, so a blank cell
 * or a stray string is routine. NaN propagates silently through every scale
 * calculation and comes out as a chart with no bars and no error.
 */
const num = (v: unknown) =>
  typeof v === "number" && Number.isFinite(v) ? v : 0;

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
  /** How long this layer is mounted, from its own start. */
  layerFrames: number;
}> = ({ layer, values, brand, layout, fallbackDirection, layerFrames }) => {
  /*
    Zero at the layer's own start, because the parent wraps this in a
    <Sequence>. Every delay calculation below is therefore relative and there is
    no `at` arithmetic to get wrong — the frame the layer thinks it is on IS the
    frame since it appeared. Remotion also unmounts the whole subtree outside
    the window, so a forty-layer template is not compositing forty invisible
    boxes on every frame of the render.
  */
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { px, width, height, isVertical } = layout;
  const { palette } = brand;

  /*
    Entrance progress. `enter` is a spring whose character comes from the brand,
    which is what stops a pasted template from feeling like it came from a
    different app — the same graphic moves differently under a playful brand
    than under a premium one, without the template knowing either exists.
  */
  const progress =
    layer.motion.in === "none"
      ? 1
      : enter({ frame, fps, spring: brand.motion.entrance });

  /*
    Leaving, timed backwards from the end of this layer's own window rather
    than the composition's. A layer with `until` and one that runs to the end
    are then the same calculation, and exits stay shorter than entrances — the
    viewer has already read it.
  */
  const exitSeconds = 0.35;
  const leaving =
    layer.motion.until !== undefined || layer.motion.out
      ? interpolate(
          frame,
          [layerFrames - sec(exitSeconds, fps), layerFrames],
          [1, 0],
          { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE.out },
        )
      : 1;

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

  /*
    The individual `translate` / `rotate` / `scale` properties, not a `transform`
    string.

    Three things move this box at once: the anchor offset, the layer's own
    rotation, and the entrance. Concatenated into one `transform` the result
    depends on the order they happen to be written in — scale after translate
    scales the anchor offset too, which shifts the element as it grows. As
    separate properties the browser applies them in a fixed, defined order, so
    the three cannot interfere with each other however a template combines them.
  */
  const entranceOffset =
    layer.motion.in === "fadeUp" ? interpolate(progress, [0, 1], [px(48), 0]) : 0;

  const opacity =
    layer.opacity *
    leaving *
    (layer.motion.in.startsWith("wipe") || layer.motion.in === "typewriter"
      ? 1
      : interpolate(progress, [0, 1], [0, 1], { extrapolateRight: "clamp" }));

  const frameStyle: React.CSSProperties = {
    position: "absolute",
    left: inset.x + (layer.box.x / 100) * availableW,
    top: inset.top + (layer.box.y / 100) * availableH,
    /*
      `max-content` when no width is given, not `auto`.

      An absolutely positioned box with `auto` width shrink-to-fits, but its
      limit is the distance from its own left edge to the container's right
      edge. A layer anchored `topRight` at x:100 therefore gets almost no room
      and every word wraps onto its own line — which is what turned two legends
      into two narrow towers sitting on top of each other. `max-content` lets
      the content decide, and maxWidth keeps a long line inside the frame.
    */
    width: layer.box.w === undefined ? "max-content" : (layer.box.w / 100) * availableW,
    maxWidth: layer.box.w === undefined ? availableW : undefined,
    height: layer.box.h === undefined ? undefined : (layer.box.h / 100) * availableH,
    translate: `${shiftX}% calc(${shiftY}% + ${entranceOffset}px)`,
    rotate: layer.box.rotate ? `${layer.box.rotate}deg` : undefined,
    scale:
      layer.motion.in === "scaleIn"
        ? String(interpolate(progress, [0, 1], [0.94, 1]))
        : undefined,
    opacity,
    // Only meaningful for wipeUp; harmless otherwise.
    /*
      One inset, three directions. `inset()` eats in from top/right/bottom/left
      in that order, so a wipe is just a matter of which side shrinks — and a
      chart or a MACD panel wiped left-to-right is the gesture people expect
      for anything on a time axis.
    */
    clipPath: layer.motion.in.startsWith("wipe")
      ? (() => {
          const eaten = interpolate(progress, [0, 1], [100, 0], {
            extrapolateRight: "clamp",
          });
          if (layer.motion.in === "wipeUp") return `inset(${eaten}% 0 0 0)`;
          if (layer.motion.in === "wipeRight") return `inset(0 ${eaten}% 0 0)`;
          return `inset(0 0 0 ${eaten}%)`;
        })()
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
              // `i / 2` because the split keeps the whitespace as its own item.
              delay: Math.floor(i / 2) * step,
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
        {/*
          Remotion's <Img>, never a bare <img>.

          A bare tag does not participate in the render's readiness check, so a
          frame can be captured before the image has decoded — the export comes
          out with a blank where the picture should be, intermittently, and only
          sometimes. <Img> holds the frame until it has loaded. This is the
          first image path in the codebase, so there was no existing usage to
          copy the right answer from.
        */}
        <Img
          src={src}
          style={{ width: "100%", height: "100%", objectFit: layer.fit, display: "block" }}
        />
      </div>
    );
  }

  if (layer.type === "macd") {
    const key = layer.data.replace(/[{}\s]/g, "");
    const raw = values[key];
    const rows = Array.isArray(raw) ? raw : [];
    const bars: Bar[] = rows.map((r) => {
      const b = r as Partial<Bar>;
      return {
        open: num(b.open),
        high: num(b.high),
        low: num(b.low),
        close: num(b.close),
      };
    });
    /*
      Three bars, not `slowPeriod`.

      Requiring a full slow period looked principled and was the worst kind of
      wrong: a template shipped with 15 sample candles and a 26-period slow EMA
      rendered an EMPTY PANEL, silently, with nothing on screen or in the
      validator to say why. The values are seeded rather than meaningless below
      a full period — the line is flat and honest about being under-fed, which
      tells someone to add data. Nothing at all tells them the feature is broken.
    */
    if (bars.length < 3) return null;

    /*
      No `futureBars` and no annotation prices — the panel's own scale is
      symmetric around zero, so it only needs the slot count to line its bars
      up with the candles above it.
    */
    const scale = priceScale(bars, [], 0.08, 0);
    const drawFrames = Math.max(sec(layer.drawSeconds, fps), 1);

    return (
      <div style={frameStyle}>
        <MacdPanel
          bars={bars}
          scale={scale}
          palette={palette}
          fastPeriod={layer.fastPeriod}
          slowPeriod={layer.slowPeriod}
          signalPeriod={layer.signalPeriod}
          lineColor={resolveColor(layer.lineColor, palette, values) ?? palette.primary}
          signalColor={resolveColor(layer.signalColor, palette, values) ?? palette.accent}
          showHistogram={layer.showHistogram}
          stroke={px(1.4)}
          progress={interpolate(frame, [0, drawFrames], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: EASE.out,
          })}
        />
      </div>
    );
  }

  if (layer.type === "chart") {
    /*
      The field reference resolves to the array itself, not to a string. `fill`
      is for text; a chart needs the data, so the key is read out directly.
    */
    const key = layer.data.replace(/[{}\s]/g, "");
    const raw = values[key];
    const rows = Array.isArray(raw) ? raw : [];

    // A line's series is label/value; candles are OHLC. Both become bars so the
    // plot and the geometry have one shape to reason about.
    const bars: Bar[] =
      layer.kind === "line"
        ? rows.map((r) => {
            const v = num((r as { value?: unknown }).value);
            return { open: v, high: v, low: v, close: v };
          })
        : rows.map((r) => {
            const b = r as Partial<Bar>;
            return {
              open: num(b.open),
              high: num(b.high),
              low: num(b.low),
              close: num(b.close),
            };
          });

    // Two bars is the minimum a scale can be built from; below that every price
    // maps to the same pixel and the chart is a flat line at the top.
    if (bars.length < 2) return null;

    const annotationKey = layer.annotations?.replace(/[{}\s]/g, "");
    const rawAnnotations = annotationKey ? values[annotationKey] : undefined;
    const annotations = Array.isArray(rawAnnotations)
      ? (rawAnnotations as Annotation[])
      : [];

    const scale = priceScale(
      bars,
      annotationPrices(annotations),
      0.08,
      layer.futureBars,
    );

    const drawFrames = Math.max(sec(layer.drawSeconds, fps), 1);
    const drawn = interpolate(frame, [0, drawFrames], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: EASE.out,
    });

    /*
      Indicators are computed here, not declared. A template says "a 12-candle
      EMA in blue"; the arithmetic is the engine's, which is the whole bargain
      that lets the format have no expressions in it.
    */
    const overlays = layer.overlays.map((o) => {
      const start = sec(o.at, fps);
      const span = Math.max(sec(o.drawSeconds, fps), 1);
      return {
        values: indicator(o.kind, bars, o.period),
        color: resolveColor(o.color, palette, values) ?? palette.primary,
        width: px(o.width),
        progress: interpolate(frame, [start, start + span], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: EASE.out,
        }),
      };
    });

    const shading =
      layer.shadeBetween && overlays[layer.shadeBetween.a] && overlays[layer.shadeBetween.b]
        ? {
            a: overlays[layer.shadeBetween.a].values,
            b: overlays[layer.shadeBetween.b].values,
            above: resolveColor(layer.shadeBetween.above, palette, values) ?? palette.primary,
            below: resolveColor(layer.shadeBetween.below, palette, values) ?? palette.accent,
            opacity: layer.shadeBetween.opacity,
            progress: interpolate(
              frame,
              [sec(layer.shadeBetween.at, fps), sec(layer.shadeBetween.at + 1.2, fps)],
              [0, 1],
              { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE.out },
            ),
          }
        : undefined;

    /*
      The price fades back as the first overlay draws, not on a timer of its
      own. Tying it to the thing that replaces it as the subject is what makes
      the handover read as one movement rather than two coincidences.
    */
    const priceOpacity =
      layer.dimPriceTo >= 1 || !overlays.length
        ? 1
        : 1 - (1 - layer.dimPriceTo) * overlays[0].progress;

    return (
      <div style={frameStyle}>
        <Plot
          kind={layer.kind}
          bars={bars}
          scale={scale}
          palette={palette}
          progress={drawn}
          stroke={px(1.4)}
          grayscale={layer.candleStyle === "grayscale"}
          priceOpacity={priceOpacity}
          overlays={overlays}
          shading={shading}
        />
        {/*
          A sibling, positioned over the same box — see the note in Plot. Also
          second in the DOM so the shapes sit above the price rather than under
          it, which is the whole point of an annotation.
        */}
        <AnnotationLayer
            annotations={annotations}
            /*
              Beats are generated rather than declared. The beat sheet is the
              Chart Analysis template's own instrument and inventing a syntax
              for it here would be a second timeline language to learn. Shapes
              appear in array order once the price has drawn, which is the
              reading people expect: here is what happened, now here is what to
              notice about it.
            */
            beats={annotations.map((a, n) => ({
              target: a.id,
              at: n * 0.35,
              duration: 0.6,
              effect: "draw" as const,
            }))}
            scale={scale}
            palette={palette}
            frame={frame}
            fps={fps}
            chartReadyFrame={drawFrames}
            px={px}
          decimals={layer.decimals}
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
        <Img
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
  const { fps, durationInFrames } = useVideoConfig();

  return (
    <AbsoluteFill>
      {/*
        Array order is drawing order — later layers sit on top. The same rule
        the annotation list uses, so there is one thing to learn rather than two.
      */}
      {template.layers.map((layer) => {
        const from = sec(layer.motion.at, fps);
        /*
          A layer runs until its own `until`, or to the end of the graphic.
          Clamped to at least one frame: a template can be shortened after its
          layers were placed, and a zero or negative duration is a Remotion
          error rather than an invisible layer. The paste step rejects a layer
          starting past the end, but `seconds` can be edited afterwards.
        */
        const layerFrames = Math.max(
          1,
          (layer.motion.until === undefined
            ? durationInFrames
            : sec(layer.motion.until, fps)) - from,
        );

        return (
          <Sequence
            key={layer.id}
            from={from}
            durationInFrames={layerFrames}
            // No wrapper element: the layer positions itself absolutely, and a
            // Sequence div in between would become the containing block.
            layout="none"
          >
            <Layer
              layer={layer}
              values={values}
              brand={brand}
              layout={layout}
              fallbackDirection={direction}
              layerFrames={layerFrames}
            />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};

/** How long a pasted template runs, in frames. */
export const customDurationInFrames = (template: TemplateFile, fps: number) =>
  Math.max(1, Math.round(template.seconds * fps));
