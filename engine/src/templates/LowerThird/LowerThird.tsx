/**
 * LOWER THIRD — name and role tag.
 *
 * The highest reuse-per-build asset in the library: every talking-head clip
 * needs one, and it's the same shape every time.
 *
 * - The brand rule wipes out first and the text follows from behind it, so the
 *   rule reads as revealing the name rather than decorating it.
 * - The panel is clipped horizontally rather than faded. A fade makes the text
 *   arrive through a grey haze; a clip makes it arrive from somewhere.
 * - Exit reverses the entrance and is quicker than it — the viewer has read it.
 */

import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { getBrand } from "../../brand/brands";
import { radius, safe, shadow, space, type, weight } from "../../brand/tokens";
import { EASE, enter, sec } from "../../motion";
import { TIMING, type LowerThirdProps } from "./schema";

export const LowerThird: React.FC<LowerThirdProps> = ({
  brand,
  name,
  role,
  handle,
  panel,
  seconds,
  speed,
}) => {
  const frame = useCurrentFrame();
  const { fps, width, height, durationInFrames } = useVideoConfig();

  const isVertical = height > width;
  const px = (n: number) => (n * Math.min(width, height)) / 1080;

  const b = getBrand(brand);
  const { palette, font } = b;

  const pace = speed * b.motion.pace;
  const introF = (TIMING.intro * fps) / pace;

  const inP = enter({ frame, fps, delay: introF, spring: b.motion.entrance });

  // Exit mirrors the entrance but faster. Timed off the composition end so it
  // stays correct whatever duration the editor picks.
  const outStart = durationInFrames - sec(TIMING.outro / pace, fps);
  const outP = interpolate(frame, [outStart, durationInFrames], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE.out,
  });

  const reveal = Math.min(inP, outP);

  // Rule leads; the text follows out from behind it.
  const ruleP = enter({ frame, fps, delay: introF, spring: "snappy" });
  const textP = enter({ frame, fps, delay: introF + sec(0.1, fps), spring: b.motion.entrance });

  return (
    <AbsoluteFill
      style={{
        justifyContent: "flex-end",
        alignItems: "flex-start",
        paddingLeft: px(safe.x),
        paddingRight: px(safe.x),
        // Vertical social puts platform UI over the lower third, so the tag has
        // to sit well above the bottom edge rather than on it.
        paddingBottom: px(isVertical ? safe.socialBottom : safe.bottom),
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "stretch",
          borderRadius: px(radius.md),
          overflow: "hidden",
          boxShadow: panel ? shadow.soft : undefined,
          // Clipped, not faded — the tag arrives from somewhere instead of
          // materialising through a haze.
          clipPath: `inset(0 ${100 - reveal * 100}% 0 0)`,
        }}
      >
        {/* Brand rule, leading edge. */}
        <div
          style={{
            width: px(10),
            background: `linear-gradient(180deg, ${palette.primary}, ${palette.accent})`,
            transformOrigin: "bottom center",
            transform: `scaleY(${ruleP})`,
          }}
        />

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: px(space.xs),
            padding: `${px(space.md)}px ${px(space.xl)}px ${px(space.md)}px ${px(space.lg)}px`,
            background: panel ? `${palette.ink}D9` : "transparent",
            transform: `translateX(${(1 - textP) * px(-24)}px)`,
          }}
        >
          <span
            style={{
              fontFamily: font.display,
              fontWeight: weight.bold,
              fontSize: px(type.subhead),
              color: palette.textPrimary,
              lineHeight: 1.1,
              letterSpacing: px(-1),
              whiteSpace: "nowrap",
            }}
          >
            {name}
          </span>

          <span
            style={{
              fontFamily: font.body,
              fontWeight: weight.medium,
              fontSize: px(type.label),
              color: palette.primary,
              lineHeight: 1.2,
              whiteSpace: "nowrap",
            }}
          >
            {role}
          </span>

          {handle ? (
            <span
              style={{
                marginTop: px(space.xs),
                fontFamily: font.body,
                fontWeight: weight.medium,
                fontSize: px(type.caption),
                color: palette.textSecondary,
                lineHeight: 1.2,
                whiteSpace: "nowrap",
              }}
            >
              {handle}
            </span>
          ) : null}
        </div>
      </div>
    </AbsoluteFill>
  );
};
