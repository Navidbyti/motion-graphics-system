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
import { contrastRatio, readableOn } from "../../brand/contrast";
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
  const baseFontSize =
    chars <= 28 ? type.hero : chars <= 70 ? type.headline : chars <= 150 ? type.subhead : type.support;

  /**
   * A pill is a single line by definition — the moment it wraps it stops being
   * a pill and becomes a stadium-shaped blob. So rather than let long text
   * wrap, the pill sizes its type to fit one line.
   *
   * The budget is solved rather than guessed, because everything in it scales
   * with the font size except the word gaps: bold display text averages ~0.56em
   * per character, the pill's own horizontal padding is 2 × 1.28em, and the
   * staggered word mode adds a fixed gap between words. Long text therefore
   * gets small type, which is the honest outcome for a tag.
   */
  const PILL_PAD_EM = 1.28;
  const pillGaps =
    animation === "words" ? (space.sm + 6) * Math.max(words.length - 1, 0) : 0;
  const fontSize =
    background === "pill"
      ? Math.max(
          type.caption,
          Math.min(
            type.headline,
            (1080 * 0.9 - pillGaps) / (Math.max(chars, 1) * 0.56 + PILL_PAD_EM * 2),
          ),
        )
      : baseFontSize;

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

  /*
    Declared after the surface so the entrance can depend on it: a message box
    should land with a tactile overshoot — that little bounce is most of why a
    bubble reads as a physical object — while the plain card surfaces keep the
    brand's own entrance, because bounce would undercut Billionaire Signal.
  */
  const blockFor = (bubble: boolean) =>
    scaleIn({
      frame,
      fps,
      spring: bubble ? "bubble" : b.motion.entrance,
      from: bubble ? 0.88 : 0.96,
    });

  /* ---------------- background ---------------- */

  /**
   * Surface styles.
   *
   * What separates a broadcast overlay from a styled div is three things, and
   * each surface below has to earn all of them:
   *
   *   1. SURFACE DEPTH — the fill alone is never the effect. Clay is inflated
   *      by *opposing* inset shadows (lit from the top-left, occluded at the
   *      bottom-right), not by a gradient. A gradient is a flat ramp; it reads
   *      as a flat ramp.
   *   2. SHADOW DIFFUSION — one shadow is a sticker. Real elevation is layered:
   *      a tight contact shadow plus a wide, very soft ambient one. The
   *      exception is brutalist, where zero blur is the entire point.
   *   3. TYPOGRAPHY CONTRAST — dark text on a mid-tone brand fill crushes.
   *      Coloured surfaces measure their own fill and take whichever of
   *      paper/ink actually reads (see brand/contrast.ts), then add a faint
   *      text shadow so the glyph edges survive over busy footage.
   *
   * Padding is expressed as a multiple of the *font size*, not a spacing token.
   * Type here scales with the text length, so a fixed inset that looked
   * generous under a short hero line looked cramped under a long one.
   *
   * IMPORTANT on `glass`: real frosted glass needs `backdrop-filter`, which
   * blurs whatever is *behind* the element at render time. In a transparent
   * overlay export there is nothing behind it — the footage only arrives later,
   * in Premiere — so the blur has nothing to work on. It is set anyway (it is
   * correct in preview and in full-frame exports), but the look cannot depend
   * on it: the frosted read comes from a bright translucent fill and a luminous
   * edge, both of which survive an alpha render.
   */
  type Emphasis = "accent" | "invert" | "highlight";

  const surfaceFor = (): {
    style: React.CSSProperties;
    text: string;
    corner: number;
    /** [vertical, horizontal] as multiples of the font size. */
    pad: [number, number] | null;
    typography?: React.CSSProperties;
    emphasis?: Emphasis;
    /** Message boxes pop; the plain card surfaces keep the brand entrance. */
    bubbleSpring?: boolean;
  } => {
    switch (background) {
      /* iMessage-ish. The shadow is layered — a tight contact shadow and a
         wide ambient one — so it lifts off B-roll without muddying it. The
         hairline border is edge light, and keeps the bubble from dissolving
         into blown-out footage. */
      case "native":
        return {
          style: {
            background: palette.paper,
            border: `${px(1)}px solid ${palette.paper}CC`,
            boxShadow: [
              `0 ${px(5)}px ${px(9)}px ${px(-2)}px rgba(0,0,0,0.07)`,
              `0 ${px(26)}px ${px(38)}px ${px(-8)}px rgba(0,0,0,0.14)`,
            ].join(", "),
          },
          text: palette.ink,
          corner: px(44),
          pad: [0.6, 0.82],
          typography: { letterSpacing: px(-fontSize * 0.03), lineHeight: 1.25 },
          emphasis: "accent",
          bubbleSpring: true,
        };

      /* Bright frosted fill + luminous inner border. `saturate` is what makes
         it read as glass rather than fog: it pulls the colour through the
         blur instead of washing it out. */
      case "glass":
        return {
          style: {
            background: `${palette.paper}A6`,
            border: `${px(1.5)}px solid ${palette.paper}E6`,
            backdropFilter: `blur(${px(20)}px) saturate(180%)`,
            WebkitBackdropFilter: `blur(${px(20)}px) saturate(180%)`,
            boxShadow: [
              `inset 0 ${px(1)}px 0 ${palette.paper}`,
              `0 ${px(16)}px ${px(34)}px rgba(15,23,42,0.18)`,
            ].join(", "),
          },
          text: palette.ink,
          corner: px(36),
          pad: [0.66, 0.9],
          typography: { letterSpacing: px(-fontSize * 0.02), lineHeight: 1.3 },
          emphasis: "accent",
          bubbleSpring: true,
        };

      /* Inflated silicone. The two insets oppose each other — light from the
         top-left, occlusion at the bottom-right — which is what fakes a 3D
         volume without a renderer. The ambient shadow is tinted with the fill
         so the bubble looks like it is bouncing its own colour onto the
         footage beneath it. */
      case "clay":
        return {
          style: {
            background: palette.primary,
            boxShadow: [
              `inset ${px(8)}px ${px(8)}px ${px(18)}px ${palette.paper}73`,
              `inset ${px(-8)}px ${px(-8)}px ${px(18)}px rgba(0,0,0,0.22)`,
              `0 ${px(18)}px ${px(34)}px ${palette.primary}59`,
            ].join(", "),
          },
          text: readableOn(palette.primary, palette.paper, palette.ink),
          corner: px(58),
          pad: [0.66, 0.95],
          typography: {
            fontWeight: weight.black,
            letterSpacing: px(-fontSize * 0.02),
            lineHeight: 1.2,
            textShadow: `0 ${px(2)}px ${px(5)}px rgba(0,0,0,0.18)`,
          },
          emphasis: "invert",
          bubbleSpring: true,
        };

      /* A broadcast pill lives on its horizontal padding. The shadow is tinted
         with the fill rather than black, which keeps it clean instead of
         dirty. */
      case "pill":
        return {
          style: {
            background: palette.primary,
            border: `${px(2)}px solid ${palette.paper}33`,
            boxShadow: `0 ${px(9)}px ${px(22)}px ${palette.primary}40`,
          },
          text: readableOn(palette.primary, palette.paper, palette.ink),
          corner: px(999),
          pad: [0.42, 1.28],
          typography: {
            letterSpacing: px(-fontSize * 0.01),
            lineHeight: 1.2,
            textShadow: `0 ${px(1)}px ${px(3)}px rgba(0,0,0,0.16)`,
          },
          emphasis: "invert",
          bubbleSpring: true,
        };

      /* Zero blur on the shadow is the whole style — the moment it softens it
         stops being brutalist and starts being a card. Type is heavy, upper
         case and tracked tight to match. */
      case "brutalist":
        return {
          style: {
            background: palette.paper,
            border: `${px(4)}px solid ${palette.ink}`,
            boxShadow: `${px(11)}px ${px(11)}px 0 ${palette.ink}`,
          },
          text: palette.ink,
          corner: px(6),
          pad: [0.58, 0.8],
          typography: {
            fontWeight: weight.black,
            textTransform: "uppercase",
            letterSpacing: px(-fontSize * 0.04),
            lineHeight: 1.05,
          },
          emphasis: "highlight",
          bubbleSpring: true,
        };

      case "solid":
        return {
          style: { background: `${palette.ink}E6`, boxShadow: shadow.soft },
          text: palette.textPrimary,
          corner: px(radius.lg),
          pad: [0.6, 0.7],
        };

      case "gradient":
        return {
          style: {
            background: `linear-gradient(135deg, ${palette.primary}, ${palette.accent})`,
            boxShadow: shadow.soft,
          },
          text: readableOn(palette.primary, palette.paper, palette.ink),
          corner: px(radius.lg),
          pad: [0.6, 0.7],
          emphasis: "invert",
        };

      default:
        return { style: {}, text: palette.textPrimary, corner: 0, pad: null };
    }
  };

  const surfaceSpec = surfaceFor();
  const surface = surfaceSpec.style;
  const textColour = surfaceSpec.text;
  const pad = surfaceSpec.pad;
  const block = blockFor(Boolean(surfaceSpec.bubbleSpring));

  /**
   * How an emphasised word separates itself from the rest of the line.
   * `accent` is the default; on a fill that already *is* the accent colour the
   * accent would be invisible, so those surfaces invert instead; brutalist
   * gets a highlighter chip, which is the idiom of the style.
   */
  const emphasisStyle: React.CSSProperties = (() => {
    switch (surfaceSpec.emphasis) {
      /*
        On a coloured fill the emphasis cannot simply invert the body text —
        that lands black-on-red, which is exactly the mid-tone crush we are
        avoiding. Prefer the brand accent when it genuinely separates from the
        fill (3:1 is the threshold for large bold display type). When it does
        not — Billionaire Signal's accent is a lighter gold on gold — fall back
        to a chip, which separates on any fill.
      */
      case "invert": {
        const fill = palette.primary;
        /*
          2.2, not WCAG's 3.0: that threshold is written for 18px bold text,
          and this type is four to six times that size. Cash for Chat's yellow
          on red sits at 2.6 and is unmistakable at display size — holding it
          to 3.0 threw away the brand-correct answer for a rule that does not
          apply. Billionaire Signal's gold-on-gold at 1.4 still fails, which is
          the case the check exists for.
        */
        if (contrastRatio(palette.accent, fill) >= 2.2) {
          return { color: palette.accent, fontWeight: weight.black };
        }
        const chip =
          contrastRatio(palette.ink, fill) >= contrastRatio(palette.paper, fill)
            ? palette.ink
            : palette.paper;
        return {
          color: readableOn(chip, palette.paper, palette.ink),
          background: chip,
          padding: `0 ${px(fontSize * 0.1)}px`,
          fontWeight: weight.black,
        };
      }
      case "highlight":
        return {
          color: palette.ink,
          background: palette.accent,
          padding: `0 ${px(fontSize * 0.1)}px`,
          fontWeight: weight.black,
        };
      default:
        return { color: palette.accent, fontWeight: weight.black };
    }
  })();

  /* ---------------- text rendering ---------------- */

  const renderWord = (word: string, key: string, delay: number) => {
    const hit = emphasised.length > 0 && normalise(word) === emphasised;
    return (
      <span
        key={key}
        style={{
          overflow: "hidden",
          display: "inline-block",
          // In the pill's nowrap row these are flex items, and flex items shrink
          // by default — which silently clipped every word to a few letters,
          // since the mask that drives the reveal is `overflow: hidden`.
          flexShrink: 0,
        }}
      >
        <span
          style={{
            display: "inline-block",
            color: textColour,
            ...(hit ? emphasisStyle : null),
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
            // The parent's `nowrap` does not reach flex children — the wrap
            // decision lives on this container, so the pill has to opt out here
            // too or the words wrap inside a nowrap box.
            flexWrap: background === "pill" ? "nowrap" : "wrap",
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
            // A pill is a single line by definition; letting it wrap turns it
            // into a rounded rectangle and the style stops working.
            maxWidth: background === "pill" ? "94%" : "88%",
            padding: pad
              ? `${px(fontSize * pad[0])}px ${px(fontSize * pad[1])}px`
              : 0,
            borderRadius: surfaceSpec.corner,
            fontFamily: font.display,
            fontWeight: weight.bold,
            fontSize: px(fontSize),
            lineHeight: 1.22,
            letterSpacing: px(-1),
            textAlign: centred ? "center" : textStart,
            // Sized to fit one line above; this is what keeps it a pill.
            whiteSpace: background === "pill" ? "nowrap" : undefined,
            ...surface,
            ...surfaceSpec.typography,
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
