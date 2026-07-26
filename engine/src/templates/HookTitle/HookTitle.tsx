/**
 * HOOK TITLE — the opening statement card.
 *
 * The most-used asset in the library and the one that most affects retention,
 * so the decisions here matter more than its simplicity suggests:
 *
 * - Words stagger in individually rather than the line fading up as a block.
 *   Staggering makes the viewer read *along* with the reveal instead of waiting
 *   for it, which is why hooks that stagger hold attention better.
 * - One word can be picked out in the brand accent. A hook usually has a single
 *   load-bearing word ("20 years", "free", "inflation") and colouring it gives
 *   the eye somewhere to land.
 * - The scrim is a vertical gradient, not a flat panel. A flat box reads as a
 *   graphic sitting on the footage; a gradient reads as part of the shot.
 */

import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { useTheme } from "../../brand/useTheme";
import { radius, safe, space, type, weight } from "../../brand/tokens";
import { EASE, exit, fadeUp, sec, wipeUp } from "../../motion";
import { TIMING, type HookTitleProps } from "./schema";

/** Strips punctuation so "years." still matches an emphasis of "years". */
const normalise = (w: string) => w.toLowerCase().replace(/[^a-z0-9]/gi, "");

export const HookTitle: React.FC<HookTitleProps> = ({
  brand,
  theme,
  eyebrow,
  text,
  subline,
  emphasis,
  scrim,
  speed,
}) => {
  const frame = useCurrentFrame();
  const { fps, width, height, durationInFrames } = useVideoConfig();

  const isVertical = height > width;
  const px = (n: number) => (n * Math.min(width, height)) / 1080;

  const b = useTheme(brand, theme);
  const { palette, font } = b;

  const pace = speed * b.motion.pace;
  const introF = (TIMING.intro * fps) / pace;
  const perWordF = (TIMING.perWord * fps) / pace;

  const words = text.trim().split(/\s+/).filter(Boolean);
  const emphasised = normalise(emphasis ?? "");

  const eyebrowIn = fadeUp({
    frame,
    fps,
    delay: introF,
    spring: b.motion.entrance,
    distance: 20,
  });

  const sublineIn = fadeUp({
    frame,
    fps,
    delay: introF + words.length * perWordF + sec(0.12, fps),
    spring: b.motion.entrance,
    distance: 24,
  });

  const ruleIn = interpolate(
    frame,
    [introF, introF + sec(0.5, fps)],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE.out },
  );

  // Everything fades together at the end — a hook that exits piecemeal reads as
  // hesitant, and the viewer has already read it.
  const out = exit({ frame, fps, durationInFrames, duration: TIMING.outro / pace });

  const scrimOpacity = interpolate(
    frame,
    [0, sec(0.4, fps)],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE.out },
  );

  return (
    <AbsoluteFill style={{ opacity: out }}>
      {scrim ? (
        <AbsoluteFill
          style={{
            // Gradient, not a panel: reads as part of the shot rather than a
            // graphic sitting on top of it.
            background: `linear-gradient(180deg, ${palette.ink}00 0%, ${palette.ink}B0 45%, ${palette.ink}E6 100%)`,
            opacity: scrimOpacity,
          }}
        />
      ) : null}

      <AbsoluteFill
        style={{
          justifyContent: "flex-end",
          alignItems: "flex-start",
          paddingLeft: px(safe.x),
          paddingRight: px(safe.x),
          paddingBottom: px(isVertical ? safe.socialBottom : safe.bottom),
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-start",
            gap: px(space.md),
            maxWidth: isVertical ? "100%" : "72%",
          }}
        >
          {eyebrow ? (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: px(space.sm),
                ...eyebrowIn,
              }}
            >
              <span
                style={{
                  fontFamily: font.body,
                  fontWeight: weight.bold,
                  fontSize: px(type.label),
                  letterSpacing: px(3),
                  color: palette.primary,
                  textTransform: "uppercase",
                }}
              >
                {eyebrow}
              </span>
              <span
                style={{
                  width: px(96),
                  height: px(5),
                  borderRadius: px(radius.pill),
                  background: `linear-gradient(90deg, ${palette.primary}, ${palette.accent})`,
                  transformOrigin: "left center",
                  transform: `scaleX(${ruleIn})`,
                }}
              />
            </div>
          ) : null}

          {/*
            Words are laid out with flex + gap rather than spaces, so each can
            animate independently without the line reflowing as they arrive.
          */}
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              columnGap: px(space.md),
              rowGap: px(space.xs),
              fontFamily: font.display,
              fontWeight: weight.black,
              fontSize: px(isVertical ? type.headline : type.hero),
              lineHeight: 1.06,
              letterSpacing: px(-2),
            }}
          >
            {words.map((word, i) => {
              const isHit = emphasised.length > 0 && normalise(word) === emphasised;
              return (
                <span key={`${word}-${i}`} style={{ overflow: "hidden", display: "block" }}>
                  <span
                    style={{
                      display: "block",
                      color: isHit ? palette.accent : palette.textPrimary,
                      ...wipeUp({
                        frame,
                        fps,
                        delay: introF + i * perWordF,
                        spring: b.motion.entrance,
                      }),
                    }}
                  >
                    {word}
                  </span>
                </span>
              );
            })}
          </div>

          {subline ? (
            <div
              style={{
                fontFamily: font.body,
                fontWeight: weight.medium,
                fontSize: px(type.support),
                color: palette.textSecondary,
                lineHeight: 1.3,
                ...sublineIn,
              }}
            >
              {subline}
            </div>
          ) : null}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
