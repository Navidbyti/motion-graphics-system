import React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { getBrand } from "../../brand/brands";
import { space, radius, type, weight, safe } from "../../brand/tokens";
import { enter, exit, stagger } from "../../motion";
import { useLayout } from "../../layout";
import type { CaptionProps } from "./schema";

/**
 * Words rise in sequence, the line holds, then it leaves.
 *
 * Two things keep it on brand. The face is the display face set tight — on
 * nestie.com the hero runs Playfair Display 900 at -3px on 59px, so the
 * tracking here is -0.05em rather than a default that would read as a
 * different company. And legibility comes from a gradient scrim rather than a
 * filled box: a hard panel over footage looks like a caption burned in by an
 * editor, while a fade reads as part of the image.
 *
 * The type sits above `safe.socialBottom` — the strip platform UI covers — and
 * below the middle of the frame, which in product footage is where the product
 * is.
 */
export const Caption: React.FC<CaptionProps> = (props) => {
  const {
    text,
    position,
    scrim,
    rule,
    verdict,
    brand: brandId,
    speed,
    scale,
    direction,
  } = props;

  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const brand = getBrand(brandId);
  const { palette, font } = brand;
  const { px, textStart, dir } = useLayout({ scale, direction, text });

  const align = textStart as "left" | "right";
  const words = text.trim().split(/\s+/);
  const rate = speed || 1;

  // exit() works back from the composition's own end, and the composition is
  // sized by captionSeconds(holdSeconds), so the hold is honoured implicitly.
  const leaving = exit({
    frame,
    fps,
    durationInFrames,
    duration: 0.45 / rate,
  });

  const ruleIn = enter({ frame, fps, spring: brand.motion.entrance });

  // Do/Don't badge. Red ✕ for the mistake, green ✓ for the fix. The badge and
  // the rule share the verdict colour so the beat reads at a glance, before the
  // words are even parsed.
  const verdictColor =
    verdict === "dont"
      ? palette.negative
      : verdict === "do"
        ? palette.positive
        : palette.primary;
  const badgeIn = enter({ frame, fps, spring: brand.motion.emphasis });

  return (
    <div
      style={{
        direction: dir,
        position: "absolute",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        justifyContent: position === "lower" ? "flex-end" : "flex-start",
      }}
    >
      {scrim ? (
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            [position === "lower" ? "bottom" : "top"]: 0,
            height: "58%",
            // Weighted toward the text and gone well before the subject. A
            // linear fade to the middle of the frame would grey the product.
            background:
              position === "lower"
                ? "linear-gradient(to top, rgba(10,10,10,0.82) 0%, rgba(10,10,10,0.55) 32%, rgba(10,10,10,0) 100%)"
                : "linear-gradient(to bottom, rgba(10,10,10,0.82) 0%, rgba(10,10,10,0.55) 32%, rgba(10,10,10,0) 100%)",
            opacity: leaving,
          }}
        />
      ) : null}

      <div
        style={{
          direction: dir,
          position: "relative",
          display: "flex",
          flexDirection: "column",
          alignItems: align === "right" ? "flex-end" : "flex-start",
          gap: px(space.md),
          paddingLeft: px(safe.x),
          paddingRight: px(safe.x),
          paddingBottom: position === "lower" ? px(safe.socialBottom) : 0,
          paddingTop: position === "upper" ? px(safe.top) : 0,
          opacity: leaving,
        }}
      >
        {verdict !== "none" ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: px(space.sm),
              opacity: Math.min(1, badgeIn * 1.4),
              // Punchier entrance: slides up and overshoots slightly past 1 as
              // the snappy spring settles, so it lands with a pop rather than a
              // soft fade.
              transform: `translateY(${(1 - badgeIn) * px(34)}px) scale(${0.8 + 0.2 * badgeIn})`,
              transformOrigin: align,
            }}
          >
            <div
              style={{
                width: px(72),
                height: px(72),
                borderRadius: px(radius.pill),
                background: verdictColor,
                color: "#FFFFFF",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontFamily: font.body,
                fontSize: px(type.subhead),
                fontWeight: weight.bold,
                lineHeight: 1,
              }}
            >
              {verdict === "dont" ? "✕" : "✓"}
            </div>
            <div
              style={{
                fontFamily: font.body,
                fontSize: px(type.label),
                fontWeight: weight.bold,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                color: verdictColor,
              }}
            >
              {verdict === "dont" ? "Don't" : "Do"}
            </div>
          </div>
        ) : rule ? (
          <div
            style={{
              width: px(96) * ruleIn,
              height: px(4),
              background: palette.primary,
              borderRadius: px(2),
              transformOrigin: align,
            }}
          />
        ) : null}

        {text.trim() === "" ? null : (
        <div
          style={{
            direction: dir,
            display: "flex",
            flexWrap: "wrap",
            // Flex lays children left-to-right whatever the text says, so a
            // word-staggered Persian line reverses without `direction` set.
            justifyContent: align === "right" ? "flex-end" : "flex-start",
            columnGap: px(space.sm),
            rowGap: px(space.xs),
          }}
        >
          {words.map((word, i) => {
            const p = enter({
              frame,
              fps,
              delay: stagger(i, fps, { per: 0.07 / rate, max: 0.8 }),
              spring: brand.motion.entrance,
            });
            return (
              <span
                key={`${word}-${i}`}
                style={{
                  display: "inline-block",
                  fontFamily: font.display,
                  fontSize: px(type.headline),
                  fontWeight: weight.black,
                  // Matches the site's hero: -3px on 59px is about -0.05em.
                  letterSpacing: "-0.05em",
                  lineHeight: 1.02,
                  color: "#FFFFFF",
                  opacity: p,
                  transform: `translateY(${(1 - p) * px(22)}px)`,
                }}
              >
                {word}
              </span>
            );
          })}
        </div>
        )}
      </div>
    </div>
  );
};
