/**
 * END CARD — the closing frame.
 *
 * The first template built on the new `withCommon` set, so it's also the proof
 * that sizing and RTL work end to end:
 *
 * - Everything sizes from `useLayout`, so the editor's scale slider shrinks the
 *   whole card at once and it holds up at any output size.
 * - Direction is set on every container that lays children out individually.
 *   Flex runs left-to-right regardless of the script inside it, so without this
 *   a Persian call-to-action would render with its words reversed — the exact
 *   failure found when HookTitle was rendered in Persian.
 * - Centred rather than corner-anchored: an end card is the last thing on
 *   screen and has the whole frame to itself, unlike a lower third.
 */

import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { useTheme } from "../../brand/useTheme";
import { radius, space, type, weight } from "../../brand/tokens";
import { useLayout } from "../../layout";
import { EASE, exit, fadeUp, scaleIn, sec } from "../../motion";
import { TIMING, type EndCardProps } from "./schema";

export const EndCard: React.FC<EndCardProps> = ({
  brand,
  theme,
  text,
  subline,
  action,
  handle,
  showMark,
  scrim,
  scale,
  direction,
  speed,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const { px, dir, textStart } = useLayout({ scale, direction });

  const b = useTheme(brand, theme);
  const { palette, font } = b;

  const pace = speed * b.motion.pace;
  const introF = (TIMING.intro * fps) / pace;
  const step = (TIMING.stagger * fps) / pace;

  /** Each element follows the one above it. */
  const at = (index: number) => introF + index * step;

  const mark = scaleIn({ frame, fps, delay: at(0), spring: b.motion.emphasis, from: 0.8 });
  const title = fadeUp({ frame, fps, delay: at(1), spring: b.motion.entrance, distance: 34 });
  const sub = fadeUp({ frame, fps, delay: at(2), spring: b.motion.entrance, distance: 26 });
  const button = scaleIn({ frame, fps, delay: at(3), spring: b.motion.emphasis, from: 0.9 });
  const foot = fadeUp({ frame, fps, delay: at(4), spring: b.motion.entrance, distance: 16 });

  const out = exit({ frame, fps, durationInFrames, duration: TIMING.outro / pace });

  const scrimIn = interpolate(frame, [0, sec(0.35, fps)], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE.out,
  });

  return (
    <AbsoluteFill style={{ opacity: out, direction: dir }}>
      {scrim ? (
        <AbsoluteFill
          style={{
            background: `radial-gradient(ellipse at center, ${palette.ink}D9 0%, ${palette.ink}F2 70%)`,
            opacity: scrimIn,
          }}
        />
      ) : null}

      <AbsoluteFill
        style={{
          justifyContent: "center",
          alignItems: "center",
          padding: px(96),
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            textAlign: "center",
            gap: px(space.lg),
            maxWidth: "88%",
          }}
        >
          {showMark ? (
            /*
              A geometric mark rather than a logo file: the brand logos aren't
              in the repo yet, and a template that renders a broken image is
              worse than one that renders a deliberate shape. Swap for the real
              logo once the SVGs land.
            */
            <div
              style={{
                width: px(96),
                height: px(96),
                borderRadius: px(radius.lg),
                background: `linear-gradient(135deg, ${palette.primary}, ${palette.accent})`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontFamily: font.display,
                fontWeight: weight.black,
                fontSize: px(type.subhead),
                color: palette.ink,
                ...mark,
              }}
            >
              {b.name.charAt(0)}
            </div>
          ) : null}

          <div
            style={{
              fontFamily: font.display,
              fontWeight: weight.black,
              fontSize: px(type.headline),
              lineHeight: 1.08,
              letterSpacing: px(-2),
              color: palette.textPrimary,
              textAlign: "center",
              ...title,
            }}
          >
            {text}
          </div>

          {subline ? (
            <div
              style={{
                fontFamily: font.body,
                fontWeight: weight.medium,
                fontSize: px(type.support),
                lineHeight: 1.35,
                color: palette.textSecondary,
                ...sub,
              }}
            >
              {subline}
            </div>
          ) : null}

          {action ? (
            <div
              style={{
                marginTop: px(space.sm),
                padding: `${px(space.md)}px ${px(space.xl)}px`,
                borderRadius: px(radius.pill),
                background: `linear-gradient(135deg, ${palette.primary}, ${palette.accent})`,
                fontFamily: font.display,
                fontWeight: weight.bold,
                fontSize: px(type.support),
                color: palette.ink,
                whiteSpace: "nowrap",
                ...button,
              }}
            >
              {action}
            </div>
          ) : null}

          {handle ? (
            <div
              style={{
                marginTop: px(space.sm),
                fontFamily: font.body,
                fontWeight: weight.medium,
                fontSize: px(type.label),
                letterSpacing: px(1),
                color: palette.primary,
                textAlign: textStart,
                ...foot,
              }}
            >
              {handle}
            </div>
          ) : null}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
