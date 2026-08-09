import React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { getBrand } from "../../brand/brands";
import { useBrandFonts } from "../../brand/loadFonts";
import { NestieLogo } from "../../brand/NestieLogo";
import { space, type, weight, safe } from "../../brand/tokens";
import { enter, stagger } from "../../motion";
import { useLayout } from "../../layout";
import type { NestieEndCardProps } from "./schema";

/**
 * Sits over the looping fire, so every element is built to read on dark, moving
 * footage: the real logo reversed to near-white, a white Playfair line, and a
 * gradient scrim rather than a filled card.
 *
 * The block is centred a little ABOVE the middle. Dead centre puts the text on
 * the flame; the safe strip at the bottom is platform UI. Between them, the
 * upper-middle is the only place the words clear both.
 */
export const NestieEndCard: React.FC<NestieEndCardProps> = (props) => {
  const { text, emphasis, subline, handle, showLogo, brand: brandId, scale, direction } =
    props;
  useBrandFonts();
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const brand = getBrand(brandId);
  const { palette, font } = brand;
  const { px, dir } = useLayout({ scale, direction, text });

  const step = (i: number) => {
    const p = enter({
      frame,
      fps,
      delay: stagger(i, fps, { per: 0.16, max: 1.0 }),
      spring: brand.motion.entrance,
    });
    return { opacity: p, transform: `translateY(${(1 - p) * px(18)}px)` };
  };

  const WHITE = "#F4F1EA";

  return (
    <div
      style={{
        direction: dir,
        position: "absolute",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        // A touch above centre — see the note above.
        justifyContent: "center",
        paddingBottom: px(safe.socialBottom),
      }}
    >
      {/* Scrim: darkest at the middle where the text sits, gone by the edges,
          so the fire still reads top and bottom rather than a flat black card. */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(120% 60% at 50% 46%, rgba(8,9,11,0.86) 0%, rgba(8,9,11,0.7) 40%, rgba(8,9,11,0.2) 78%, rgba(8,9,11,0) 100%)",
        }}
      />

      <div
        style={{
          position: "relative",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          textAlign: "center",
          gap: px(space.lg),
          paddingLeft: px(safe.x),
          paddingRight: px(safe.x),
          maxWidth: "92%",
        }}
      >
        {showLogo ? (
          <div
            style={{
              opacity: step(0).opacity,
              transform: step(0).transform,
            }}
          >
            <NestieLogo wordmark={WHITE} chevron={palette.primary} height={px(64)} />
          </div>
        ) : null}

        <div
          style={{
            fontFamily: font.display,
            fontSize: px(type.subhead),
            // Marcellus is single-weight — never faux-bold it (client rule).
            fontWeight: weight.regular,
            letterSpacing: "0",
            lineHeight: 1.08,
            color: WHITE,
            textWrap: "balance",
            opacity: step(1).opacity,
            transform: step(1).transform,
          }}
        >
          {emphasis && text.includes(emphasis) ? (
            <>
              {text.slice(0, text.indexOf(emphasis))}
              {/* Client's .oi-title em: emphasis word in brand orange, non-italic */}
              <span style={{ color: palette.primary }}>{emphasis}</span>
              {text.slice(text.indexOf(emphasis) + emphasis.length)}
            </>
          ) : (
            text
          )}
        </div>

        {subline ? (
          <div
            style={{
              fontFamily: font.body,
              fontSize: px(type.caption),
              fontWeight: weight.regular,
              lineHeight: 1.35,
              color: "rgba(244,241,234,0.82)",
              opacity: step(2).opacity,
              transform: step(2).transform,
            }}
          >
            {subline}
          </div>
        ) : null}

        {/* No CTA button in video: a drawn button isn't tappable in an organic
            reel, and an ad's real CTA is the platform's native button below the
            video — not ours. The handle line below is the sign-off. */}
        {handle ? (
          <div
            style={{
              fontFamily: font.body,
              fontSize: px(type.caption),
              fontWeight: weight.semibold,
              letterSpacing: "0.06em",
              color: palette.primary,
              opacity: step(4).opacity,
              transform: step(4).transform,
            }}
          >
            {handle}
          </div>
        ) : null}
      </div>
    </div>
  );
};
