/**
 * TEXT CARD — the general-purpose text asset.
 *
 * Five reveals × five backgrounds in one template. The alternative was five
 * near-identical templates, which would have made the Library a list of
 * variations rather than a list of things.
 *
 * Notes worth keeping:
 *
 * - Type size is derived from the text length. A six-word line and a forty-word
 *   paragraph cannot share a font size, and asking the editor to pick one by
 *   hand is asking him to do the template's job.
 * - The typewriter reveals by clipping, NOT by slicing the string. Slicing
 *   Persian mid-word breaks the shaping — Arabic-script letters change form
 *   depending on their neighbours, so a half-typed word renders as unrelated
 *   glyphs. Clipping shows the correctly-shaped text progressively instead.
 * - Every mode ends on the same held state, so the editor can switch animation
 *   without the final frame moving.
 */

import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { useTheme } from "../../brand/useTheme";
import { radius, shadow, space, type, weight } from "../../brand/tokens";
import { useLayout } from "../../layout";
import { EASE, exit, fadeUp, scaleIn, sec, wipeUp } from "../../motion";
import { TIMING, linesOf, wordsOf, type TextCardProps } from "./schema";

const normalise = (w: string) => w.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");

export const TextCard: React.FC<TextCardProps> = ({
  brand,
  theme,
  text,
  animation,
  background,
  align,
  emphasis,
  holdSeconds,
  showTail,
  typing,
  scale,
  direction,
  speed,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const { px, dir, isRTL, textStart } = useLayout({ scale, direction });

  const b = useTheme(brand, theme);
  const { palette, font } = b;

  const pace = speed * b.motion.pace;
  const introF = (TIMING.intro * fps) / pace;

  /**
   * Typing indicator: the bubble lands empty with animating dots, then the
   * text arrives. It is the single detail that makes a bubble read as a real
   * conversation rather than a caption in a rounded box — which is the whole
   * reason this style works as a hook.
   */
  const typingOn = Boolean(typing) && background === "native";
  const typingF = typingOn ? (0.85 * fps) / pace : 0;
  const startF = introF + typingF;

  const words = wordsOf(text);
  const lines = linesOf(text);
  const emphasised = normalise(emphasis ?? "");

  /**
   * Size from length. These thresholds are eyeballed against the type scale
   * rather than computed — the goal is "always readable, never comical", and a
   * formula would still need the same magic numbers.
   */
  const chars = text.trim().length;
  const fontSize =
    chars <= 28 ? type.hero : chars <= 70 ? type.headline : chars <= 150 ? type.subhead : type.support;

  const centred = align === "center";

  /* ---------------- reveal ---------------- */

  const revealFrames =
    animation === "typewriter"
      ? (chars * TIMING.perChar * fps) / pace
      : animation === "words"
        ? (words.length * TIMING.perWord * fps) / pace
        : animation === "lines"
          ? (Math.max(lines.length, 1) * 0.18 * fps) / pace
          : (0.35 * fps) / pace;

  const reveal = interpolate(frame, [startF, startF + revealFrames], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: animation === "typewriter" ? EASE.linear : EASE.out,
  });

  const out = exit({ frame, fps, durationInFrames, duration: TIMING.outro / pace });

  const block = scaleIn({ frame, fps, spring: b.motion.entrance, from: 0.96 });

  /* ---------------- background ---------------- */

  /**
   * Surface styles.
   *
   * IMPORTANT on `glass`: real frosted glass needs `backdrop-filter`, which
   * blurs whatever is *behind* the element at render time. In a transparent
   * overlay export there is nothing behind it — the footage only arrives later,
   * in Premiere — so the blur would have nothing to work on and render as
   * clear. The look is therefore built from translucency, a luminous edge and
   * an internal sheen, which reads as frosted once the editor lays it over
   * footage. That is the closest honest approximation for an alpha overlay.
   */
  const surfaceFor = (): {
    style: React.CSSProperties;
    text: string;
    corner: number;
    padded: boolean;
  } => {
    switch (background) {
      case "native":
        // iMessage-ish: light bubble, generous corner, ultra-soft diffused
        // shadow so it lifts off B-roll without muddying it.
        return {
          style: {
            background: palette.paper,
            boxShadow: `0 ${px(18)}px ${px(48)}px rgba(0,0,0,0.28)`,
          },
          text: palette.ink,
          corner: px(46),
          padded: true,
        };

      case "glass":
        return {
          style: {
            background: `${palette.paper}24`,
            border: `${px(1.5)}px solid ${palette.paper}59`,
            // Applied for the sake of preview and full-frame exports; a no-op
            // in a transparent render, by design rather than by accident.
            backdropFilter: `blur(${px(26)}px)`,
            boxShadow: `inset 0 ${px(1)}px 0 ${palette.paper}4D, 0 ${px(16)}px ${px(44)}px rgba(0,0,0,0.30)`,
          },
          text: palette.textPrimary,
          corner: px(38),
          padded: true,
        };

      case "clay":
        // Inflated/matte: a light source top-left via the gradient, an inset
        // highlight for the specular, and soft ambient occlusion beneath.
        return {
          style: {
            background: `linear-gradient(155deg, ${palette.accent}, ${palette.primary})`,
            boxShadow: [
              `inset 0 ${px(6)}px ${px(14)}px ${palette.paper}5E`,
              `inset 0 ${px(-10)}px ${px(18)}px rgba(0,0,0,0.18)`,
              `0 ${px(22)}px ${px(40)}px rgba(0,0,0,0.30)`,
            ].join(", "),
          },
          text: palette.ink,
          corner: px(62),
          padded: true,
        };

      case "pill":
        return {
          style: {
            background: palette.primary,
            boxShadow: `0 ${px(10)}px ${px(28)}px rgba(0,0,0,0.28)`,
          },
          text: palette.ink,
          corner: px(999),
          padded: true,
        };

      case "brutalist":
        // Sharp corners, thick border, hard offset shadow with zero blur.
        return {
          style: {
            background: palette.paper,
            border: `${px(5)}px solid ${palette.ink}`,
            boxShadow: `${px(12)}px ${px(12)}px 0 ${palette.ink}`,
          },
          text: palette.ink,
          corner: px(2),
          padded: true,
        };

      case "solid":
        return {
          style: { background: `${palette.ink}E6`, boxShadow: shadow.soft },
          text: palette.textPrimary,
          corner: px(radius.lg),
          padded: true,
        };

      case "gradient":
        return {
          style: {
            background: `linear-gradient(135deg, ${palette.primary}, ${palette.accent})`,
            boxShadow: shadow.soft,
          },
          text: palette.ink,
          corner: px(radius.lg),
          padded: true,
        };

      default:
        return { style: {}, text: palette.textPrimary, corner: 0, padded: false };
    }
  };

  const surfaceSpec = surfaceFor();
  const surface = surfaceSpec.style;
  const textColour = surfaceSpec.text;
  const onGradient = background === "gradient" || background === "clay";
  const padded = surfaceSpec.padded;

  /* ---------------- text rendering ---------------- */

  const renderWord = (word: string, key: string, delay: number) => {
    const hit = emphasised.length > 0 && normalise(word) === emphasised;
    return (
      <span key={key} style={{ overflow: "hidden", display: "inline-block" }}>
        <span
          style={{
            display: "inline-block",
            /*
              On a coloured fill the accent colour IS the fill, so an
              emphasised word became invisible. Flip to the light surface
              colour there — the contrast is what carries the emphasis, not the
              specific hue.
            */
            color: hit
              ? onGradient
                ? palette.paper
                : palette.accent
              : textColour,
            fontWeight: hit ? weight.black : weight.bold,
            ...wipeUp({ frame, fps, delay, spring: b.motion.entrance }),
          }}
        >
          {word}
        </span>
      </span>
    );
  };

  const body = (() => {
    if (animation === "words") {
      const per = revealFrames / Math.max(words.length, 1);
      return (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            justifyContent: centred ? "center" : "flex-start",
            columnGap: px(space.sm + 6),
            rowGap: px(space.xs),
            direction: dir,
          }}
        >
          {words.map((w, i) => renderWord(w, `${w}-${i}`, startF + i * per))}
        </div>
      );
    }

    if (animation === "lines") {
      const per = revealFrames / Math.max(lines.length, 1);
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: px(space.xs) }}>
          {lines.map((line, i) => (
            <span key={i} style={{ overflow: "hidden", display: "block" }}>
              <span
                style={{
                  display: "block",
                  color: textColour,
                  ...wipeUp({ frame, fps, delay: startF + i * per, spring: b.motion.entrance }),
                }}
              >
                {line}
              </span>
            </span>
          ))}
        </div>
      );
    }

    if (animation === "typewriter") {
      /*
        Clipped, not sliced. Slicing the string mid-word destroys Arabic-script
        shaping — Persian letters change form based on their neighbours, so a
        partially-typed word renders as different letters entirely. Clipping
        keeps the text correctly shaped and simply uncovers it.
      */
      return (
        <div style={{ position: "relative", color: textColour, direction: dir }}>
          <span
            style={{
              display: "inline-block",
              clipPath: isRTL
                ? `inset(0 0 0 ${(1 - reveal) * 100}%)`
                : `inset(0 ${(1 - reveal) * 100}% 0 0)`,
            }}
          >
            {text}
          </span>
          {/* Caret rides the reveal edge and disappears once typing finishes. */}
          {reveal < 1 ? (
            <span
              style={{
                position: "absolute",
                top: "8%",
                bottom: "8%",
                [isRTL ? "right" : "left"]: `${reveal * 100}%`,
                width: px(4),
                background: palette.accent,
                opacity: Math.round(frame / 6) % 2 ? 1 : 0.25,
              }}
            />
          ) : null}
        </div>
      );
    }

    // rise / pop — the whole block arrives as one.
    const motion =
      animation === "pop"
        ? scaleIn({ frame, fps, delay: startF, spring: b.motion.emphasis, from: 0.9 })
        : fadeUp({ frame, fps, delay: startF, spring: b.motion.entrance, distance: 40 });

    return (
      <div style={{ color: textColour, direction: dir, ...motion }}>{text}</div>
    );
  })();

  return (
    <AbsoluteFill style={{ opacity: out, direction: dir }}>
      {background === "scrim" ? (
        <AbsoluteFill
          style={{
            background: `linear-gradient(180deg, ${palette.ink}00 0%, ${palette.ink}D9 55%, ${palette.ink}F2 100%)`,
            opacity: interpolate(frame, [0, sec(0.4, fps)], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
          }}
        />
      ) : null}

      <AbsoluteFill
        style={{
          justifyContent: "center",
          alignItems: centred ? "center" : isRTL ? "flex-end" : "flex-start",
          padding: px(110),
        }}
      >
        <div
          style={{
            position: "relative",
            maxWidth: "92%",
            padding: padded
              ? background === "pill"
                ? `${px(space.md)}px ${px(space.xl + 14)}px`
                : `${px(space.xl)}px ${px(space.xl + 8)}px`
              : 0,
            borderRadius: surfaceSpec.corner,
            fontFamily: font.display,
            fontWeight: weight.bold,
            fontSize: px(fontSize),
            lineHeight: 1.22,
            letterSpacing: px(-1),
            textAlign: centred ? "center" : textStart,
            ...surface,
            ...block,
          }}
        >
          {/*
            Typing dots occupy the bubble before the text does. Rendered in
            place of the body rather than over it, so the bubble is sized by
            the dots and then grows to the text — which is what a real message
            bubble does.
          */}
          {typingOn && frame < startF ? (
            <div
              style={{
                display: "flex",
                gap: px(space.sm),
                padding: `${px(space.xs)}px 0`,
                opacity: interpolate(frame, [introF, introF + sec(0.15, fps)], [0, 1], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                }),
              }}
            >
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  style={{
                    width: px(18),
                    height: px(18),
                    borderRadius: "50%",
                    background: palette.ink,
                    // Staggered sine gives the familiar rolling bounce.
                    opacity:
                      0.35 +
                      0.65 *
                        Math.max(0, Math.sin((frame / 4) * (Math.PI / 3) - i * 0.9)),
                  }}
                />
              ))}
            </div>
          ) : (
            body
          )}

          {/*
            Speech-bubble tail, mirrored under RTL so it points the right way.
            Only the two bubble-shaped surfaces get one — a pill or a brutalist
            box with a tail stops reading as either.
          */}
          {(background === "native" || background === "clay") && showTail ? (
            <div
              style={{
                position: "absolute",
                bottom: px(-16),
                [isRTL ? "right" : "left"]: px(48),
                width: px(40),
                height: px(28),
                background:
                  background === "clay" ? palette.primary : palette.paper,
                clipPath: isRTL
                  ? "polygon(100% 0, 100% 100%, 0 0)"
                  : "polygon(0 0, 0 100%, 100% 0)",
              }}
            />
          ) : null}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
