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

  const reveal = interpolate(frame, [introF, introF + revealFrames], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: animation === "typewriter" ? EASE.linear : EASE.out,
  });

  const out = exit({ frame, fps, durationInFrames, duration: TIMING.outro / pace });

  const block = scaleIn({ frame, fps, spring: b.motion.entrance, from: 0.96 });

  /* ---------------- background ---------------- */

  const onGradient = background === "gradient";
  const textColour = onGradient ? palette.ink : palette.textPrimary;

  const surface: React.CSSProperties =
    background === "solid"
      ? { background: `${palette.ink}E6`, boxShadow: shadow.soft }
      : background === "gradient"
        ? {
            background: `linear-gradient(135deg, ${palette.primary}, ${palette.accent})`,
            boxShadow: shadow.soft,
          }
        : background === "bubble"
          ? { background: `${palette.surface}F2`, boxShadow: shadow.soft }
          : {};

  const padded = background !== "none" && background !== "scrim";

  /* ---------------- text rendering ---------------- */

  const renderWord = (word: string, key: string, delay: number) => {
    const hit = emphasised.length > 0 && normalise(word) === emphasised;
    return (
      <span key={key} style={{ overflow: "hidden", display: "inline-block" }}>
        <span
          style={{
            display: "inline-block",
            color: hit ? (onGradient ? palette.ink : palette.accent) : textColour,
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
          {words.map((w, i) => renderWord(w, `${w}-${i}`, introF + i * per))}
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
                  ...wipeUp({ frame, fps, delay: introF + i * per, spring: b.motion.entrance }),
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
        ? scaleIn({ frame, fps, delay: introF, spring: b.motion.emphasis, from: 0.9 })
        : fadeUp({ frame, fps, delay: introF, spring: b.motion.entrance, distance: 40 });

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
            padding: padded ? `${px(space.xl)}px ${px(space.xl + 8)}px` : 0,
            borderRadius:
              background === "bubble" ? px(radius.lg + 14) : px(radius.lg),
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
          {body}

          {/* Speech-bubble tail, mirrored under RTL so it points the right way. */}
          {background === "bubble" && showTail ? (
            <div
              style={{
                position: "absolute",
                bottom: px(-18),
                [isRTL ? "right" : "left"]: px(46),
                width: px(42),
                height: px(30),
                background: `${palette.surface}F2`,
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
