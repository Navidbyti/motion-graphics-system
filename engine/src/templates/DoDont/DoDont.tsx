import React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { getBrand } from "../../brand/brands";
import { space, radius, type, weight, safe } from "../../brand/tokens";
import { enter, fadeUp, sec, tabular } from "../../motion";
import { useLayout } from "../../layout";
import type { DoDontProps } from "./schema";

/**
 * Two stacked rows — the mistake above, the fix below — cycling one pair at a
 * time. Stacked rather than side-by-side because at 9:16 a horizontal split
 * gives each side ~500px, which forces type down to where it stops reading on
 * a phone. Vertical keeps both lines at full width.
 *
 * The pairs share one layout and swap content, so the eye stays put and only
 * the words change. That is what makes a series feel like a series.
 */
export const DoDont: React.FC<DoDontProps> = (props) => {
  const { headline, pairs, secondsPerPair, episode, brand: brandId, scale, direction } = props;
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const brand = getBrand(brandId);
  const { palette, font } = brand;

  const { px, textStart, dir } = useLayout({
    scale,
    direction,
    text: `${headline} ${pairs.map((p) => `${p.dont} ${p.do}`).join(" ")}`,
  });

  const introSec = 1.1;
  const perPair = sec(secondsPerPair, fps);
  const introFrames = sec(introSec, fps);

  // Which pair is on screen. Clamped so the last one holds through the outro
  // rather than the card emptying before the video ends.
  const idx = Math.min(
    pairs.length - 1,
    Math.max(0, Math.floor((frame - introFrames) / perPair)),
  );
  const pair = pairs[idx];
  const localFrame = frame - introFrames - idx * perPair;

  const titleIn = fadeUp({
    frame,
    fps,
    spring: brand.motion.entrance,
    distance: px(28),
  });

  // Each row arrives just after the other so the eye reads mistake → fix.
  const rowIn = (delaySec: number) =>
    enter({
      frame: Math.max(0, localFrame),
      fps,
      delay: sec(delaySec, fps),
      spring: brand.motion.entrance,
    });

  const Row: React.FC<{
    kind: "dont" | "do";
    text: string;
    progress: number;
  }> = ({ kind, text, progress }) => {
    const isDont = kind === "dont";
    const tone = isDont ? palette.negative : palette.positive;
    return (
      <div
        style={{
          direction: dir,
          display: "flex",
          alignItems: "center",
          gap: px(space.md),
          width: "100%",
          padding: `${px(space.lg)}px ${px(space.lg)}px`,
          borderRadius: px(radius.md),
          // A backing surface so the card stays legible over bright footage —
          // white text alone disappears over a daylight patio.
          background: palette.surface,
          borderLeft: `${px(6)}px solid ${tone}`,
          opacity: progress,
          transform: `translateY(${(1 - progress) * px(18)}px)`,
        }}
      >
        <div
          style={{
            flex: "none",
            width: px(64),
            height: px(64),
            borderRadius: px(radius.pill),
            background: tone,
            color: palette.ink,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: font.display,
            fontSize: px(type.support),
            fontWeight: weight.bold,
            lineHeight: 1,
          }}
        >
          {isDont ? "✕" : "✓"}
        </div>
        <div
          style={{
            fontFamily: font.body,
            fontSize: px(type.support),
            fontWeight: isDont ? weight.medium : weight.semibold,
            color: isDont ? palette.textSecondary : palette.textPrimary,
            lineHeight: 1.25,
            textAlign: textStart as "left" | "right",
          }}
        >
          {text}
        </div>
      </div>
    );
  };

  return (
    <div
      style={{
        direction: dir,
        position: "absolute",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        gap: px(space.lg),
        paddingLeft: px(safe.x),
        paddingRight: px(safe.x),
        paddingTop: px(safe.top),
        // Vertical social covers the lower third with platform UI.
        paddingBottom: px(safe.socialBottom),
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: px(space.xs),
          opacity: titleIn.opacity,
          transform: titleIn.transform,
          // Same backing as the rows. Without it the cream headline sits bare
          // on transparency and vanishes over a bright daylight plate — the
          // overlay rule in TEMPLATE_SPEC §4.
          alignSelf: textStart === "right" ? "flex-end" : "flex-start",
          background: palette.surface,
          borderRadius: px(radius.md),
          padding: `${px(space.md)}px ${px(space.lg)}px`,
        }}
      >
        {episode ? (
          <div
            style={{
              fontFamily: font.body,
              fontSize: px(type.label),
              fontWeight: weight.semibold,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: palette.primary,
              textAlign: textStart as "left" | "right",
              ...tabular,
            }}
          >
            {episode}
          </div>
        ) : null}
        <div
          style={{
            fontFamily: font.display,
            fontSize: px(type.headline),
            fontWeight: weight.bold,
            color: palette.textPrimary,
            lineHeight: 1.05,
            textAlign: textStart as "left" | "right",
            textWrap: "balance",
          }}
        >
          {headline}
        </div>
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: px(space.md),
          width: "100%",
        }}
      >
        <Row kind="dont" text={pair.dont} progress={rowIn(0)} />
        <Row kind="do" text={pair.do} progress={rowIn(0.22)} />
      </div>
    </div>
  );
};
